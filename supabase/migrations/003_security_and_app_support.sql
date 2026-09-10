-- Apply after 001_schema, 001_rls and 002_auth_and_storage (or cloud_apply).
-- Idempotent; does not delete inspection records or stored files.
begin;

create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() in ('authenticated', 'anon') and new.role is distinct from old.role
     and public.current_role() is distinct from 'admin'::user_role then
    raise exception 'Only administrators may change account roles' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles
for each row execute function public.protect_profile_role();

drop policy if exists "inspectors / admins create" on public.inspections;
create policy "inspectors / admins create" on public.inspections for insert to authenticated
with check (public.current_role() = 'admin' or
  (public.current_role() = 'inspector' and inspector_id = auth.uid()
   and status in ('draft', 'pending') and approved_by is null and approved_at is null and deleted_at is null));

drop policy if exists "owner / admin update while not approved" on public.inspections;
create policy "owner / admin update while not approved" on public.inspections for update to authenticated
using (public.current_role() = 'admin' or (inspector_id = auth.uid() and status in ('draft', 'rejected')))
with check (public.current_role() = 'admin' or
  (public.current_role() = 'inspector' and inspector_id = auth.uid() and status in ('draft', 'pending')));

create or replace function public.protect_inspection_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' then
    if public.current_role() = 'admin' then
      if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        new.approved_by := auth.uid(); new.approved_at := now();
      elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        new.rejected_by := auth.uid(); new.rejected_at := now();
      end if;
    elsif tg_op = 'UPDATE' and (
      new.inspector_id is distinct from old.inspector_id or new.customer_id is distinct from old.customer_id
      or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) then
      raise exception 'Only administrators may change inspection ownership or approval fields' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists protect_inspection_workflow on public.inspections;
create trigger protect_inspection_workflow before insert or update on public.inspections
for each row execute function public.protect_inspection_workflow();

-- Drafts are namespaced as draft/<authenticated user id>/<room>/<photo>.
-- Legacy draft/<room>/<photo> objects remain available to admins for recovery.
create or replace function public.can_access_inspection_photo(object_name text, writing boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.current_role() = 'admin'
    or (split_part(object_name, '/', 1) = 'draft'
        and split_part(object_name, '/', 2) = auth.uid()::text
        and public.current_role() = 'inspector')
    or exists (select 1 from public.inspections i where i.id::text = split_part(object_name, '/', 1)
      and ((writing and i.inspector_id = auth.uid() and i.status in ('draft','rejected'))
        or (not writing and (i.inspector_id = auth.uid() or i.customer_id = auth.uid())))))
$$;
drop policy if exists "inspection_photos_read" on storage.objects;
drop policy if exists "inspection_photos_write" on storage.objects;
drop policy if exists "inspection_photos_update" on storage.objects;
drop policy if exists "inspection_photos_delete" on storage.objects;
create policy "inspection_photos_read" on storage.objects for select to authenticated
using (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, false));
create policy "inspection_photos_write" on storage.objects for insert to authenticated
with check (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, true));
create policy "inspection_photos_update" on storage.objects for update to authenticated
using (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, true))
with check (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, true));
create policy "inspection_photos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, true));

-- Participants may add their own read receipt, but cannot rewrite messages.
drop policy if exists "members update read receipts" on public.messages;
create policy "members update read receipts" on public.messages for update to authenticated
using (exists (select 1 from public.chats c where c.id = chat_id and auth.uid() = any(c.participants)))
with check (exists (select 1 from public.chats c where c.id = chat_id and auth.uid() = any(c.participants)));
create or replace function public.protect_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' then
    if (to_jsonb(new) - 'read_by') is distinct from (to_jsonb(old) - 'read_by') then
      raise exception 'Only read receipts may be updated' using errcode = '42501';
    end if;
    new.read_by := array(select distinct x from unnest(old.read_by || array[auth.uid()]) x);
  end if;
  return new;
end;
$$;
drop trigger if exists protect_message_update on public.messages;
create trigger protect_message_update before update on public.messages
for each row execute function public.protect_message_update();

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880), ('chat-attachments', 'chat-attachments', false, 20971520)
on conflict (id) do nothing;
drop policy if exists "avatar writes" on storage.objects;
create policy "avatar writes" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text or public.current_role() = 'admin'));
drop policy if exists "avatar owner reads" on storage.objects;
create policy "avatar owner reads" on storage.objects for select to authenticated
using (bucket_id = 'avatars');
drop policy if exists "chat attachment reads" on storage.objects;
create policy "chat attachment reads" on storage.objects for select to authenticated
using (bucket_id = 'chat-attachments' and exists (
  select 1 from public.chats c where c.id::text = split_part(name, '/', 1) and auth.uid() = any(c.participants)));
drop policy if exists "chat attachment inserts" on storage.objects;
create policy "chat attachment inserts" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-attachments' and exists (
  select 1 from public.chats c where c.id::text = split_part(name, '/', 1) and auth.uid() = any(c.participants)));
drop policy if exists "chat attachment deletes" on storage.objects;
create policy "chat attachment deletes" on storage.objects for delete to authenticated
using (bucket_id = 'chat-attachments' and owner_id = auth.uid()::text);

revoke all on function public.protect_profile_role() from public;
revoke all on function public.protect_inspection_workflow() from public;
revoke all on function public.protect_message_update() from public;
revoke all on function public.can_access_inspection_photo(text, boolean) from public;
grant execute on function public.can_access_inspection_photo(text, boolean) to authenticated;
commit;

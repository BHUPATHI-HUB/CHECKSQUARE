-- =============================================================================
-- CheckSquare — Phase-3 auth + storage glue
-- =============================================================================
-- Apply AFTER 001_schema.sql and 001_rls.sql.  Adds:
--   1. A trigger that mirrors every new auth.users row into public.profiles
--      so the FK from inspections/appointments/etc. is always satisfied.
--   2. Storage RLS policies for the `inspection-photos` bucket so the React
--      app can upload DIRECTLY from the browser using the user's Supabase
--      access token (no PB hook round-trip needed) AFTER the Phase-3 cutover.
-- =============================================================================

-- ─── 1.  auth.users ↔ public.profiles trigger ────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  )
  on conflict (id) do update
    set email = excluded.email,
        name  = coalesce(excluded.name, public.profiles.name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep email + name fresh on updates (e.g. email change in the Supabase Auth UI).
create or replace function public.handle_user_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set email = new.email,
         name  = coalesce(new.raw_user_meta_data->>'full_name', name),
         updated_at = now()
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_user_update();

-- ─── 2.  Storage RLS for the inspection-photos bucket ────────────────────
-- These run on Supabase Storage's internal storage.objects table.  The first
-- path segment is the inspectionId in our convention (see frontend helper).
--
-- Read  → user must be admin OR own the inspection (inspector OR customer).
-- Write → user must be admin OR the inspector who owns the inspection AND
--         the inspection is not yet approved.
-- Delete same as write.

drop policy if exists "inspection_photos_read"  on storage.objects;
drop policy if exists "inspection_photos_write" on storage.objects;
drop policy if exists "inspection_photos_delete" on storage.objects;

create policy "inspection_photos_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'inspection-photos'
    and (
      public.current_role() = 'admin'
      or exists (
        select 1 from public.inspections i
        where (i.id::text = split_part(name, '/', 1) or split_part(name, '/', 1) = 'draft')
          and (i.inspector_id = auth.uid() or i.customer_id = auth.uid())
      )
    )
  );

create policy "inspection_photos_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-photos'
    and (
      public.current_role() = 'admin'
      or split_part(name, '/', 1) = 'draft'
      or exists (
        select 1 from public.inspections i
        where i.id::text = split_part(name, '/', 1)
          and i.inspector_id = auth.uid()
          and i.status <> 'approved'
      )
    )
  );

create policy "inspection_photos_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inspection-photos'
    and (
      public.current_role() = 'admin'
      or exists (
        select 1 from public.inspections i
        where i.id::text = split_part(name, '/', 1)
          and i.inspector_id = auth.uid()
          and i.status <> 'approved'
      )
    )
  );

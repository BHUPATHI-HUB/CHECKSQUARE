-- =============================================================================
-- CheckSquare — Phase-3 RLS policies (Supabase)
-- =============================================================================
-- Mirrors the PocketBase API rules so authorisation semantics are identical
-- after the Phase-3 cutover.  Apply AFTER 001_schema.sql.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.inspections         enable row level security;
alter table public.inspection_photos   enable row level security;
alter table public.appointments        enable row level security;
alter table public.chats               enable row level security;
alter table public.messages            enable row level security;
alter table public.notifications       enable row level security;
alter table public.app_settings        enable row level security;
alter table public.report_downloads    enable row level security;

-- Helper: role of the currently-authenticated user.
create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'customer'::user_role
  )
$$;

-- ─── profiles ─────────────────────────────────────────────────────────────
-- Tightened version of PocketBase users.listRule (fixes security gap S1).
create policy "self can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "admins read all profiles"
  on public.profiles for select
  using (public.current_role() = 'admin');

create policy "inspectors read assigned customers"
  on public.profiles for select
  using (
    public.current_role() = 'inspector'
    and id in (
      select customer_id from public.inspections where inspector_id = auth.uid()
    )
  );

create policy "self / admin update profile"
  on public.profiles for update
  using (id = auth.uid() or public.current_role() = 'admin');

-- RLS controls which rows are reachable; this trigger controls which profile
-- fields may change. A user must never be able to promote their own account.
create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role
     and public.current_role() is distinct from 'admin' then
    raise exception 'Only an administrator can change user roles'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

-- ─── inspections ──────────────────────────────────────────────────────────
create policy "inspectors / admins create" on public.inspections for insert
  with check (public.current_role() = 'admin'
    or (public.current_role() = 'inspector' and inspector_id = auth.uid()));

create policy "owners + assignees + admins read"
  on public.inspections for select
  using (
    public.current_role() = 'admin'
    or inspector_id = auth.uid()
    or customer_id  = auth.uid()
  );

create policy "owner / admin update while not approved" on public.inspections for update
  using (public.current_role() = 'admin' or
    (public.current_role() = 'inspector' and inspector_id = auth.uid()
      and status <> 'approved' and deleted_at is null))
  with check (public.current_role() = 'admin' or
    (public.current_role() = 'inspector' and inspector_id = auth.uid()
      and status <> 'approved' and deleted_at is null));

create policy "only admins delete"
  on public.inspections for delete
  using (public.current_role() = 'admin');

-- Keep the report lifecycle authoritative on the database. UI guards alone
-- cannot prevent forged approve/reject requests or concurrent overwrites.
create or replace function public.guard_inspection_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() = 'admin' then return new; end if;
  if public.current_role() is distinct from 'inspector'
     or new.inspector_id is distinct from auth.uid()
     or new.status not in ('draft', 'pending')
     or new.approved_by is not null or new.approved_at is not null
     or new.rejected_by is not null or new.rejected_at is not null
     or new.rejection_reason is not null
     or new.deleted_at is not null or new.deleted_by is not null
     or new.deletion_reason is not null then
    raise exception 'Inspectors may create only their own unreviewed reports' using errcode = '42501';
  end if;
  if new.customer_id is not null and not exists (
    select 1 from public.appointments a
    where a.customer_id = new.customer_id and a.inspector_id = auth.uid()
      and a.status in ('scheduled', 'in_progress')
  ) then
    raise exception 'Customer must belong to an assigned active appointment' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists inspections_insert_guard on public.inspections;
create trigger inspections_insert_guard before insert on public.inspections
  for each row execute function public.guard_inspection_insert();

create or replace function public.guard_inspection_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() = 'admin' then return new; end if;
  if public.current_role() is distinct from 'inspector'
     or old.inspector_id is distinct from auth.uid()
     or old.status = 'approved' or old.deleted_at is not null
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.inspector_id is distinct from old.inspector_id
     or new.customer_id is distinct from old.customer_id
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.deleted_at is distinct from old.deleted_at
     or new.deleted_by is distinct from old.deleted_by
     or new.deletion_reason is distinct from old.deletion_reason then
    raise exception 'Inspection ownership, approval and archive fields are protected' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
    (old.status in ('draft', 'rejected') and new.status in ('draft', 'pending'))
    or (old.status = 'pending' and new.status = 'draft')
  ) then
    raise exception 'Invalid inspector inspection status transition' using errcode = '42501';
  end if;
  -- Rejection history may only be cleared by the database on resubmission.
  if old.status in ('draft', 'rejected') and new.status = 'pending' then
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  elsif new.rejected_by is distinct from old.rejected_by
     or new.rejected_at is distinct from old.rejected_at
     or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Rejection fields are protected' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists inspections_update_guard on public.inspections;
create trigger inspections_update_guard
  before update on public.inspections
  for each row execute function public.guard_inspection_update();

-- ─── inspection_photos ────────────────────────────────────────────────────
create policy "photos follow inspection visibility"
  on public.inspection_photos for select
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.current_role() = 'admin'
          or i.inspector_id = auth.uid()
          or i.customer_id  = auth.uid()
        )
    )
  );

create policy "photo write follows inspection edit"
  on public.inspection_photos for insert
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (public.current_role() = 'admin'
             or (i.inspector_id = auth.uid() and i.status <> 'approved'))
    )
  );

create policy "photo delete follows inspection edit"
  on public.inspection_photos for delete
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (public.current_role() = 'admin'
             or (i.inspector_id = auth.uid() and i.status <> 'approved'))
    )
  );

-- ─── appointments ─────────────────────────────────────────────────────────
create policy "customers / admins book" on public.appointments for insert
  with check (public.current_role() = 'admin' or
    (public.current_role() = 'customer' and customer_id = auth.uid()
      and inspector_id is null and inspection_id is null and status = 'scheduled'));

create policy "appointment visibility"
  on public.appointments for select
  using (
    public.current_role() = 'admin'
    or customer_id  = auth.uid()
    or inspector_id = auth.uid()
  );

create policy "appointment update" on public.appointments for update
  using (public.current_role() = 'admin'
    or (public.current_role() = 'customer' and customer_id = auth.uid())
    or (public.current_role() = 'inspector' and inspector_id = auth.uid()))
  with check (public.current_role() = 'admin'
    or (public.current_role() = 'customer' and customer_id = auth.uid())
    or (public.current_role() = 'inspector' and inspector_id = auth.uid()));

-- Appointment ownership alone is insufficient for updates: each role has a
-- different set of mutable fields. This trigger prevents clients from
-- changing assignment, ownership, or lifecycle fields directly.
create or replace function public.guard_appointment_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() = 'admin' then return new; end if;
  if public.current_role() = 'customer' and old.customer_id = auth.uid() then
    -- An allowlist also protects fields added by future migrations.
    if old.status <> 'scheduled' or
       (to_jsonb(new) - array['scheduled_at','time_slot','property_address','notes','updated_at'])
       is distinct from
       (to_jsonb(old) - array['scheduled_at','time_slot','property_address','notes','updated_at']) then
      raise exception 'Customers may edit only booking details before work starts' using errcode = '42501';
    end if;
  elsif public.current_role() = 'inspector' and old.inspector_id = auth.uid() then
    if old.status not in ('scheduled','in_progress') or
       (to_jsonb(new) - array['inspection_id','status','updated_at'])
       is distinct from
       (to_jsonb(old) - array['inspection_id','status','updated_at']) then
      raise exception 'Inspectors may only start their assigned appointment' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and not (old.status = 'scheduled' and new.status = 'in_progress') then
      raise exception 'Only administrators may complete or cancel appointments' using errcode = '42501';
    end if;
    if old.inspection_id is not null and new.inspection_id is distinct from old.inspection_id then
      raise exception 'An existing inspection link cannot be replaced' using errcode = '42501';
    end if;
    -- Permit the actual start-inspection caller, but never attach a foreign
    -- report or a report for a different customer. The appointment row lock
    -- serializes competing attempts to set its first inspection link.
    if new.status = 'in_progress' or new.inspection_id is not null then
      if new.inspection_id is null or new.status <> 'in_progress' or not exists (
        select 1 from public.inspections i where i.id = new.inspection_id
          and i.inspector_id = auth.uid() and i.customer_id = old.customer_id
          and i.deleted_at is null
      ) then
        raise exception 'Link an owned report for this appointment customer' using errcode = '42501';
      end if;
    end if;
  else
    raise exception 'Appointment access denied' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_update_guard on public.appointments;
create trigger appointments_update_guard
  before update on public.appointments
  for each row execute function public.guard_appointment_update();

create policy "only admin delete appt"
  on public.appointments for delete using (public.current_role() = 'admin');

-- ─── chats / messages / notifications ────────────────────────────────────
create policy "chat visibility" on public.chats for select
  using (auth.uid() = any(participants) or public.current_role() = 'admin');

create policy "chat insert" on public.chats for insert
  with check (auth.uid() = any(participants));

create policy "chat delete by participant or staff" on public.chats for delete
  using (
    public.current_role() in ('admin','inspector')
    or auth.uid() = any(participants)
  );

create policy "messages visible to chat members" on public.messages for select
  using (
    exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() = any(c.participants)
    )
    or public.current_role() = 'admin'
  );

create policy "messages insertable by chat members" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() = any(c.participants)
    )
  );

create policy "message delete by sender / staff" on public.messages for delete
  using (
    sender_id = auth.uid() or public.current_role() in ('admin','inspector')
  );

create policy "notifications self" on public.notifications for select using (user_id = auth.uid());
create policy "notifications update self" on public.notifications for update using (user_id = auth.uid());
create policy "notifications delete self" on public.notifications for delete using (user_id = auth.uid());

-- ─── app_settings ─────────────────────────────────────────────────────────
create policy "settings readable to all authed" on public.app_settings for select
  using (auth.role() = 'authenticated');

create policy "settings write only admin" on public.app_settings for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ─── report_downloads ────────────────────────────────────────────────────
create policy "own downloads only" on public.report_downloads for select
  using (user_id = auth.uid() or public.current_role() = 'admin');

create policy "downloads insert self" on public.report_downloads for insert
  with check (user_id = auth.uid());

create policy "downloads delete self / admin" on public.report_downloads for delete
  using (user_id = auth.uid() or public.current_role() = 'admin');

-- ─── Storage bucket policies (apply via Supabase Dashboard or REST) ──────
-- Bucket `inspection-photos` is PRIVATE.  Reads & writes go through signed
-- URLs minted by the PocketBase hook, so a permissive policy is fine while
-- PocketBase still gates the mint.  After the Phase-3 cutover, replace
-- with policies keyed on inspection ownership similar to inspection_photos.

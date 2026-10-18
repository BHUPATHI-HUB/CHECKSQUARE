-- Existing installations: apply after 003_profile_role_security.sql.
-- Idempotent; no existing reports or appointments are rewritten.
begin;

drop policy if exists "inspectors / admins create" on public.inspections;
create policy "inspectors / admins create" on public.inspections for insert
  with check (public.current_role() = 'admin'
    or (public.current_role() = 'inspector' and inspector_id = auth.uid()));

drop policy if exists "owner / admin update while not approved" on public.inspections;
create policy "owner / admin update while not approved" on public.inspections for update
  using (public.current_role() = 'admin' or
    (public.current_role() = 'inspector' and inspector_id = auth.uid()
      and status <> 'approved' and deleted_at is null))
  with check (public.current_role() = 'admin' or
    (public.current_role() = 'inspector' and inspector_id = auth.uid()
      and status <> 'approved' and deleted_at is null));

-- INSERT needs its own guard: an UPDATE-only guard does not stop forged
-- approvals or ownership on new reports, including offline upserts.
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
create trigger inspections_update_guard before update on public.inspections
  for each row execute function public.guard_inspection_update();

drop policy if exists "customers / admins book" on public.appointments;
create policy "customers / admins book" on public.appointments for insert
  with check (public.current_role() = 'admin' or
    (public.current_role() = 'customer' and customer_id = auth.uid()
      and inspector_id is null and inspection_id is null and status = 'scheduled'));

drop policy if exists "appointment update" on public.appointments;
create policy "appointment update" on public.appointments for update
  using (public.current_role() = 'admin'
    or (public.current_role() = 'customer' and customer_id = auth.uid())
    or (public.current_role() = 'inspector' and inspector_id = auth.uid()))
  with check (public.current_role() = 'admin'
    or (public.current_role() = 'customer' and customer_id = auth.uid())
    or (public.current_role() = 'inspector' and inspector_id = auth.uid()));

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
create trigger appointments_update_guard before update on public.appointments
  for each row execute function public.guard_appointment_update();

commit;

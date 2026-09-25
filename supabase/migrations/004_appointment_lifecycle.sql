-- Appointment lifecycle safeguards. Apply after 003_security_and_app_support.sql.
begin;

alter type appointment_status add value if not exists 'requested';

alter table public.appointments
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists previous_scheduled_at timestamptz,
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists reschedule_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_reschedule_count_nonnegative'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_reschedule_count_nonnegative
      check (reschedule_count >= 0);
  end if;
end $$;

create or replace function public.validate_appointment_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_role() = 'customer' then
    if tg_op = 'INSERT' and new.customer_id <> auth.uid() then
      raise exception 'Customers may only create appointments for themselves' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' then
      if new.customer_id is distinct from old.customer_id
         or new.inspector_id is distinct from old.inspector_id
         or new.inspection_id is distinct from old.inspection_id
         or new.scheduled_at is distinct from old.scheduled_at
         or new.time_slot is distinct from old.time_slot
         or new.property_address is distinct from old.property_address
         or new.reschedule_count is distinct from old.reschedule_count
         or new.cancelled_by is distinct from old.cancelled_by
         or new.cancelled_at is distinct from old.cancelled_at
         or new.cancel_reason is distinct from old.cancel_reason
         or new.reschedule_reason is distinct from old.reschedule_reason
         or (new.status not in ('cancelled'::appointment_status, old.status)) then
        raise exception 'Customers may only cancel their own appointments' using errcode = '42501';
      end if;
    end if;
  end if;

  if public.current_role() = 'inspector' and tg_op = 'UPDATE' then
    if old.inspector_id <> auth.uid()
       or new.customer_id is distinct from old.customer_id
       or new.inspector_id is distinct from old.inspector_id
       or new.inspection_id is distinct from old.inspection_id
       or new.scheduled_at is distinct from old.scheduled_at
       or new.time_slot is distinct from old.time_slot
       or new.property_address is distinct from old.property_address
       or new.notes is distinct from old.notes
       or new.reschedule_count is distinct from old.reschedule_count
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason
       or new.reschedule_reason is distinct from old.reschedule_reason
       or new.status not in ('in_progress'::appointment_status, 'completed'::appointment_status) then
      raise exception 'Inspectors may only advance their own appointment status' using errcode = '42501';
    end if;
  end if;

  if new.inspection_id is not null then
    if not exists (select 1 from public.inspections i where i.id = new.inspection_id
      and i.customer_id = new.customer_id
      and (new.inspector_id is null or i.inspector_id = new.inspector_id)) then
      raise exception 'Appointment and inspection ownership do not match' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.scheduled_at is distinct from old.scheduled_at then
    new.previous_scheduled_at := old.scheduled_at;
    new.reschedule_count := old.reschedule_count + 1;
  end if;
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_appointment_write on public.appointments;
create trigger validate_appointment_write
before insert or update on public.appointments
for each row execute function public.validate_appointment_write();

drop policy if exists "customers / admins book" on public.appointments;
drop policy if exists "appointment update" on public.appointments;
create policy "customers / admins book" on public.appointments for insert
  with check (public.current_role() = 'admin' or (public.current_role() = 'customer' and customer_id = auth.uid()));
create policy "appointment update" on public.appointments for update
  using (public.current_role() in ('admin','inspector') or customer_id = auth.uid())
  with check (public.current_role() in ('admin','inspector') or customer_id = auth.uid());

drop policy if exists "admin creates notifications" on public.notifications;
create policy "admin creates notifications" on public.notifications for insert
  with check (public.current_role() = 'admin');

commit;

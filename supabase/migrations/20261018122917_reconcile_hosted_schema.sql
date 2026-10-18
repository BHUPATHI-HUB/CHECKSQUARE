-- Reconcile historical hosted triggers without rewriting existing reports.
begin;
alter table public.inspections add column if not exists submitted_at timestamptz;
alter table public.inspections add column if not exists submitted_by text;
alter table public.appointments add column if not exists cancel_reason text;
alter table public.appointments add column if not exists cancelled_by uuid references public.profiles(id);
alter table public.appointments add column if not exists cancelled_at timestamptz;
alter table public.appointments add column if not exists previous_scheduled_at timestamptz;
alter table public.appointments add column if not exists reschedule_count integer not null default 0;
alter table public.appointments add column if not exists reschedule_reason text;
-- The old validator forbids the atomic inspection link. The current guards
-- enforce ownership and transitions; retain its bookkeeping separately.
drop trigger if exists validate_appointment_write on public.appointments;
drop trigger if exists protect_inspection_workflow on public.inspections;

create or replace function public.guard_appointment_update() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if public.current_role()='admin' then return new; end if;
 if public.current_role()='customer' and old.customer_id=auth.uid() then
  if old.status::text not in ('scheduled','requested') or
     (new.status is distinct from old.status and new.status::text<>'cancelled') or
     (to_jsonb(new)-array['scheduled_at','time_slot','property_address','notes','updated_at','status','cancel_reason'])
       is distinct from
     (to_jsonb(old)-array['scheduled_at','time_slot','property_address','notes','updated_at','status','cancel_reason']) then
   raise exception 'Customers may edit or cancel only their booking before work starts' using errcode='42501';
  end if;
 elsif public.current_role()='inspector' and old.inspector_id=auth.uid() then
  if old.status not in ('scheduled','in_progress') or
     (to_jsonb(new)-array['inspection_id','status','updated_at']) is distinct from
     (to_jsonb(old)-array['inspection_id','status','updated_at']) then
   raise exception 'Inspectors may only start their assigned appointment' using errcode='42501';
  end if;
  if new.status is distinct from old.status and not(old.status='scheduled' and new.status='in_progress') then
   raise exception 'Only administrators may complete or cancel appointments' using errcode='42501';
  end if;
  if old.inspection_id is not null and new.inspection_id is distinct from old.inspection_id then
   raise exception 'An existing inspection link cannot be replaced' using errcode='42501';
  end if;
  if new.status='in_progress' or new.inspection_id is not null then
   if new.inspection_id is null or new.status<>'in_progress' or not exists(select 1 from public.inspections i
     where i.id=new.inspection_id and i.inspector_id=auth.uid() and i.customer_id=old.customer_id and i.deleted_at is null) then
    raise exception 'Link an owned report for this appointment customer' using errcode='42501';
   end if;
  end if;
 else raise exception 'Appointment access denied' using errcode='42501';
 end if;
 return new;
end $$;
create or replace function public.appointment_bookkeeping() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' and new.scheduled_at is distinct from old.scheduled_at then
  new.previous_scheduled_at:=old.scheduled_at;new.reschedule_count:=old.reschedule_count+1;
 end if;
 if new.status='cancelled' and (tg_op='INSERT' or old.status is distinct from new.status) then
  new.cancelled_at:=clock_timestamp();new.cancelled_by:=auth.uid();
 end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
drop trigger if exists zzz_appointment_bookkeeping on public.appointments;
create trigger zzz_appointment_bookkeeping before insert or update on public.appointments
 for each row execute function public.appointment_bookkeeping();
create or replace function public.submission_bookkeeping() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if new.status='pending' and (tg_op='INSERT' or old.status is distinct from new.status) then
  new.submitted_at:=clock_timestamp();new.submitted_by:=auth.uid()::text;
 end if;
 return new;
end $$;
drop trigger if exists zzz_submission_bookkeeping on public.inspections;
create trigger zzz_submission_bookkeeping before insert or update on public.inspections
 for each row execute function public.submission_bookkeeping();

-- Internal RLS lookups belong outside the exposed API schema. Public
-- compatibility wrappers run as the caller and return only their permission.
create schema if not exists checksquare_private;
revoke all on schema checksquare_private from public,anon;
grant usage on schema checksquare_private to authenticated,service_role;
do $$
begin
 if (select prosecdef from pg_proc where oid='public.current_role()'::regprocedure) then
  alter function public.current_role() set schema checksquare_private;
 end if;
 if (select prosecdef from pg_proc where oid='public.can_read_photo(text,text)'::regprocedure) then
  alter function public.can_read_photo(text,text) set schema checksquare_private;
 end if;
 if (select prosecdef from pg_proc where oid='public.can_write_photo(text)'::regprocedure) then
  alter function public.can_write_photo(text) set schema checksquare_private;
 end if;
end $$;
create or replace function public.current_role() returns public.user_role language sql stable security invoker set search_path=public
 as $$select checksquare_private.current_role()$$;
create or replace function public.can_read_photo(object_name text,object_owner text) returns boolean language sql stable security invoker set search_path=public
 as $$select checksquare_private.can_read_photo(object_name,object_owner)$$;
create or replace function public.can_write_photo(object_name text) returns boolean language sql stable security invoker set search_path=public
 as $$select checksquare_private.can_write_photo(object_name)$$;
revoke execute on all functions in schema checksquare_private from public,anon;
grant execute on all functions in schema checksquare_private to authenticated,service_role;
revoke execute on function public.current_role(),public.can_read_photo(text,text),public.can_write_photo(text) from public,anon;
grant execute on function public.current_role(),public.can_read_photo(text,text),public.can_write_photo(text) to authenticated,service_role;
-- Trigger entrypoints are not application RPCs. Existing orphaned helpers are
-- kept for schema compatibility but no longer callable through the Data API.
do $$ declare item record;
begin
 for item in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.prorettype='trigger'::regtype or p.proname in('can_access_inspection_photo','can_insert_inspection_photo')) loop
  execute format('revoke execute on function %s from public,anon,authenticated',item.signature);
 end loop;
end $$;
create index if not exists client_error_events_actor_time on public.client_error_events(actor_id,created_at);
commit;

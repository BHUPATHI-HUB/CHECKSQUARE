-- Apply after 004. Transactional, repeatable and safe for existing rows.
begin;
alter table public.inspections add column if not exists property_metrics jsonb not null default '[]';
alter table public.inspections add column if not exists include_score boolean;
alter table public.inspections add column if not exists score_overrides jsonb not null default '{}';
alter table public.inspections add column if not exists version bigint not null default 1;

-- Do not depend on Supabase's legacy default grants.
grant usage on schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
grant select,insert,update,delete on public.profiles,public.inspections,public.inspection_photos,
 public.appointments,public.chats,public.messages,public.notifications,public.app_settings,
 public.report_downloads to authenticated;
grant all on all tables in schema public to service_role;

create table if not exists public.inspection_events (
 id uuid primary key default gen_random_uuid(),
 inspection_id uuid references public.inspections(id) on delete set null,
 actor_id uuid references public.profiles(id) on delete set null,
 previous_status text, next_status text not null, version bigint not null,
 created_at timestamptz not null default now()
);
alter table public.inspection_events enable row level security;
revoke all on public.inspection_events from anon,authenticated;
grant select on public.inspection_events to authenticated;
grant all on public.inspection_events to service_role;
drop policy if exists "admins read inspection events" on public.inspection_events;
create policy "admins read inspection events" on public.inspection_events for select to authenticated
 using (public.current_role()='admin');

-- Restrict unpublished reports at the API boundary, not just in the dashboard.
drop policy if exists "owners + assignees + admins read" on public.inspections;
create policy "owners + assignees + admins read" on public.inspections for select to authenticated
 using (public.current_role()='admin' or inspector_id=auth.uid()
   or (customer_id=auth.uid() and status='approved' and deleted_at is null));

create or replace function public.inspection_lifecycle() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
  new.version := old.version+1;
  new.updated_at := clock_timestamp();
  if old.metadata->>'appointmentId' is not null and
     new.metadata->>'appointmentId' is distinct from old.metadata->>'appointmentId' then
   raise exception 'An inspection appointment cannot be replaced' using errcode='42501';
  end if;
  if new.status is distinct from old.status and public.current_role()='admin' then
   if not ((old.status='pending' and new.status in ('approved','rejected','draft'))
      or (old.status in ('draft','rejected') and new.status in ('draft','pending','approved'))
      or (old.status='approved' and new.status='draft')) then
    raise exception 'Invalid review transition' using errcode='42501';
   end if;
  end if;
 else
  new.version := 1;
 end if;
 if new.status='approved' and (tg_op='INSERT' or old.status is distinct from new.status) then
  if public.current_role()<>'admin' then raise exception 'Only admins approve reports' using errcode='42501'; end if;
  new.approved_by:=auth.uid(); new.approved_at:=clock_timestamp();
  new.rejected_by:=null; new.rejected_at:=null; new.rejection_reason:=null;
 elsif new.status='rejected' and (tg_op='INSERT' or old.status is distinct from new.status) then
  if public.current_role()<>'admin' or nullif(btrim(new.rejection_reason),'') is null then
   raise exception 'Administrator review and a rejection reason are required' using errcode='42501';
  end if;
  new.rejected_by:=auth.uid(); new.rejected_at:=clock_timestamp();
  new.approved_by:=null; new.approved_at:=null;
 elsif new.status in ('draft','pending') then
  new.approved_by:=null; new.approved_at:=null;
 end if;
 return new;
end $$;
drop trigger if exists zz_inspection_lifecycle on public.inspections;
create trigger zz_inspection_lifecycle before insert or update on public.inspections
 for each row execute function public.inspection_lifecycle();

-- The report, appointment link, audit and notifications commit together.
create or replace function public.after_inspection_save() returns trigger
language plpgsql security definer set search_path=public as $$
declare booking public.appointments; booking_id uuid;
begin
 if nullif(new.metadata->>'appointmentId','') is not null then
  booking_id:=(new.metadata->>'appointmentId')::uuid;
  select * into booking from public.appointments where id=booking_id for update;
  if not found or booking.customer_id is distinct from new.customer_id
     or booking.inspector_id is distinct from new.inspector_id
     or booking.status='cancelled' then
   raise exception 'Appointment assignment does not match this report' using errcode='42501';
  end if;
  if booking.inspection_id is not null and booking.inspection_id<>new.id then
   raise exception 'This appointment already has a report. Reopen it from the dashboard.' using errcode='23505';
  end if;
  if booking.inspection_id is null or (new.status='approved' and booking.status<>'completed') then
  update public.appointments set inspection_id=new.id,
   status=case when new.status='approved' then 'completed'::appointment_status
               when booking.status='completed' then booking.status
               else 'in_progress'::appointment_status end,
   updated_at=clock_timestamp() where id=booking_id;
  end if;
 end if;
 if not exists(select 1 from public.chats where inspection_id=new.id) then
  insert into public.chats(type,participants,inspection_id)
  values('group',array(select distinct id from public.profiles where role='admin'
    or id=new.inspector_id or id=new.customer_id),new.id);
 end if;
 if tg_op='INSERT' or old.status is distinct from new.status then
  insert into public.inspection_events(inspection_id,actor_id,previous_status,next_status,version)
   values(new.id,auth.uid(),case when tg_op='UPDATE' then old.status::text end,new.status::text,new.version);
  if new.status='approved' and new.customer_id is not null then
   insert into public.notifications(user_id,type,title,data)
    values(new.customer_id,'report_approved','Your inspection report is ready',jsonb_build_object('inspectionId',new.id));
  elsif new.status='rejected' then
   insert into public.notifications(user_id,type,title,body,data)
    values(new.inspector_id,'report_rejected','Your report needs changes',new.rejection_reason,jsonb_build_object('inspectionId',new.id));
  end if;
 end if;
 return new;
end $$;
drop trigger if exists inspection_saved on public.inspections;
create trigger inspection_saved after insert or update on public.inspections
 for each row execute function public.after_inspection_save();

-- An active assignment cannot silently leave the linked report with another inspector.
create or replace function public.validate_appointment_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.inspector_id is not null and not exists(select 1 from public.profiles
     where id=new.inspector_id and role in ('inspector','admin')) then
  raise exception 'Assign a staff account' using errcode='42501';
 end if;
 if tg_op='UPDATE' and old.inspection_id is not null and
   (new.inspector_id is distinct from old.inspector_id or new.customer_id is distinct from old.customer_id
     or new.inspection_id is distinct from old.inspection_id) then
  raise exception 'Assignment is locked after a report starts' using errcode='42501';
 end if;
 if new.inspection_id is not null and not exists(select 1 from public.inspections i
    where i.id=new.inspection_id and i.inspector_id=new.inspector_id
      and i.customer_id=new.customer_id) then
  raise exception 'Report and appointment ownership must match' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists zz_appointment_assignment on public.appointments;
create trigger zz_appointment_assignment before insert or update on public.appointments
 for each row execute function public.validate_appointment_assignment();

-- One atomic RPC supports initial saves, retries and optimistic concurrency.
-- Security invoker deliberately retains the caller's RLS and trigger checks.
create or replace function public.persist_inspection(p_id uuid,p_payload jsonb,p_expected_version bigint default null)
returns public.inspections language plpgsql security invoker set search_path=public as $$
declare existing public.inspections; patched public.inspections; result public.inspections;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 select * into existing from public.inspections where id=p_id for update;
 if found then
  if p_expected_version is null then
   if to_jsonb(existing) @> p_payload then return existing; end if;
   raise exception 'A saved report already exists. Reload before editing.' using errcode='40001';
  end if;
  if existing.version<>p_expected_version then
   raise exception 'This report changed on another device. Reload before saving.' using errcode='40001';
  end if;
  patched:=jsonb_populate_record(existing,p_payload);
  update public.inspections set inspector_id=patched.inspector_id,inspector_name=patched.inspector_name,
   customer_id=patched.customer_id,status=patched.status,property_type=patched.property_type,
   metadata=patched.metadata,area_calculations=patched.area_calculations,water_quality=patched.water_quality,
   room_inspections=patched.room_inspections,property_metrics=patched.property_metrics,include_score=patched.include_score,
   score_overrides=patched.score_overrides,score=patched.score,score_breakdown=patched.score_breakdown,
   approved_by=patched.approved_by,approved_at=patched.approved_at,rejected_by=patched.rejected_by,
   rejected_at=patched.rejected_at,rejection_reason=patched.rejection_reason,
   deleted_at=patched.deleted_at,deleted_by=patched.deleted_by,deletion_reason=patched.deletion_reason
   where id=p_id returning * into result;
 else
  -- A versioned edit must never recreate a deleted or inaccessible report.
  if p_expected_version is not null then raise exception 'Report unavailable' using errcode='42501'; end if;
  insert into public.inspections(id,inspector_id,inspector_name,customer_id,status,property_type,
   metadata,area_calculations,water_quality,room_inspections,property_metrics,include_score,score_overrides)
  values(p_id,(p_payload->>'inspector_id')::uuid,p_payload->>'inspector_name',(p_payload->>'customer_id')::uuid,
   coalesce((p_payload->>'status')::inspection_status,'draft'),(p_payload->>'property_type')::property_type,
   coalesce(p_payload->'metadata','{}'),coalesce(p_payload->'area_calculations','[]'),
   coalesce(p_payload->'water_quality','{}'),coalesce(p_payload->'room_inspections','[]'),
   coalesce(p_payload->'property_metrics','[]'),(p_payload->>'include_score')::boolean,
   coalesce(p_payload->'score_overrides','{}')) returning * into result;
 end if;
 return result;
end $$;
revoke execute on function public.persist_inspection(uuid,jsonb,bigint) from public,anon;
grant execute on function public.persist_inspection(uuid,jsonb,bigint) to authenticated;

-- Private media: new keys use <staff UUID>/<report UUID>/<room>/<photo>.
-- Old <report UUID>/... keys retain ownership checks; global draft/ reads close.
create or replace function public.photo_report_id(object_name text) returns text
language sql immutable set search_path=public as $$
 select case when split_part(object_name,'/',2) ~ '^[0-9a-f-]{36}$'
 then split_part(object_name,'/',2) else split_part(object_name,'/',1) end
$$;
create or replace function public.can_read_photo(object_name text,object_owner text) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.current_role()='admin'
 or (public.current_role()='inspector' and object_owner=auth.uid()::text)
 or exists(select 1 from public.inspections i where i.id::text=public.photo_report_id(object_name)
  and (i.inspector_id=auth.uid() or (i.customer_id=auth.uid() and i.status='approved' and i.deleted_at is null))))
$$;
create or replace function public.can_write_photo(object_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.current_role()='admin' or
 (public.current_role()='inspector' and (
   (split_part(object_name,'/',1)=auth.uid()::text and
    not exists(select 1 from public.inspections i where i.id::text=public.photo_report_id(object_name)
     and (i.inspector_id<>auth.uid() or i.status = 'approved' or i.deleted_at is not null)))
   or exists(select 1 from public.inspections i where i.id::text=split_part(object_name,'/',1)
    and i.inspector_id=auth.uid() and i.status <> 'approved' and i.deleted_at is null))))
$$;
drop policy if exists "inspection_photos_read" on storage.objects;
drop policy if exists "inspection_photos_write" on storage.objects;
drop policy if exists "inspection_photos_update" on storage.objects;
drop policy if exists "inspection_photos_delete" on storage.objects;
create policy "inspection_photos_read" on storage.objects for select to authenticated
 using(bucket_id='inspection-photos' and public.can_read_photo(name,owner::text));
create policy "inspection_photos_write" on storage.objects for insert to authenticated
 with check(bucket_id='inspection-photos' and public.can_write_photo(name));
create policy "inspection_photos_update" on storage.objects for update to authenticated
 using(bucket_id='inspection-photos' and public.can_write_photo(name))
 with check(bucket_id='inspection-photos' and public.can_write_photo(name));
create policy "inspection_photos_delete" on storage.objects for delete to authenticated
 using(bucket_id='inspection-photos' and public.can_write_photo(name));

-- Staff do not acquire access to unrelated conversations by knowing an ID.
drop policy if exists "chat delete by participant or staff" on public.chats;
create policy "chat delete by participant or staff" on public.chats for delete to authenticated
 using(public.current_role()='admin' or (public.current_role()='inspector' and auth.uid()=any(participants)));
drop policy if exists "message delete by sender / staff" on public.messages;
create policy "message delete by sender / staff" on public.messages for delete to authenticated
 using(public.current_role()='admin' or sender_id=auth.uid() or
  (public.current_role()='inspector' and exists(select 1 from public.chats c where c.id=chat_id and auth.uid()=any(c.participants))));

-- Read receipts expose only a self-add RPC; clients cannot rewrite a message.
create or replace function public.mark_message_read(p_id uuid) returns void
language sql security definer set search_path=public as $$
 update public.messages m set read_by=array(select distinct unnest(m.read_by || array[auth.uid()]))
 where m.id=p_id and exists(select 1 from public.chats c where c.id=m.chat_id and auth.uid()=any(c.participants))
$$;
revoke execute on function public.mark_message_read(uuid) from public,anon;
grant execute on function public.mark_message_read(uuid) to authenticated;

-- Provision support without exposing the administrator profile directory.
create or replace function public.ensure_support_chat() returns public.chats
language plpgsql security definer set search_path=public as $$
declare result public.chats; members uuid[];
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into result from public.chats where inspection_id is null
   and auth.uid()=any(participants) and type='group' limit 1;
 if found then return result; end if;
 members:=array(select id from public.profiles where role='admin' or id=auth.uid());
 insert into public.chats(type,participants) values('group',members) returning * into result;
 return result;
end $$;
revoke execute on function public.ensure_support_chat() from public,anon;
grant execute on function public.ensure_support_chat() to authenticated;

insert into storage.buckets(id,name,public) values('avatars','avatars',false) on conflict(id) do nothing;
drop policy if exists "avatars_read" on storage.objects;
drop policy if exists "avatars_write" on storage.objects;
create policy "avatars_read" on storage.objects for select to authenticated
 using(bucket_id='avatars' and (public.current_role()='admin' or split_part(name,'/',1)=auth.uid()::text));
create policy "avatars_write" on storage.objects for insert to authenticated
 with check(bucket_id='avatars' and public.current_role()='admin');

-- Lock down helpers to signed-in calls; triggers run without execute grants.
revoke execute on function public.photo_report_id(text),public.can_read_photo(text,text),
 public.can_write_photo(text),public.current_role() from public,anon;
grant execute on function public.photo_report_id(text),public.can_read_photo(text,text),
 public.can_write_photo(text),public.current_role() to authenticated,service_role;
create table if not exists public.client_error_events(
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references public.profiles(id),
 code text not null,route text not null,created_at timestamptz not null default now()
);
alter table public.client_error_events enable row level security;
revoke all on public.client_error_events from anon,authenticated;
grant select on public.client_error_events to authenticated;
grant all on public.client_error_events to service_role;
drop policy if exists "admins view client failures" on public.client_error_events;
create policy "admins view client failures" on public.client_error_events for select to authenticated using(public.current_role()='admin');
create or replace function public.record_client_error(p_code text,p_route text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_code not in ('render_error','unhandled_error','unhandled_rejection') then return; end if;
 perform pg_advisory_xact_lock(hashtext('client-error:'||auth.uid()::text));
 if (select count(*) from public.client_error_events where actor_id=auth.uid() and created_at>now()-interval '1 minute')>=20 then return; end if;
 insert into public.client_error_events(actor_id,code,route) values(auth.uid(),p_code,left(regexp_replace(p_route,'[^a-zA-Z0-9/_:-]','','g'),120));
end $$;
revoke execute on function public.record_client_error(text,text) from public,anon;
grant execute on function public.record_client_error(text,text) to authenticated;
commit;

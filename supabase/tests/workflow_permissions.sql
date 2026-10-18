-- Run after migrations 003/004 in a disposable Supabase database:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/workflow_permissions.sql
\set ON_ERROR_STOP on
begin;

create function pg_temp.expect_denied(statement text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then return;
  end;
  raise exception 'FAIL: unauthorized operation succeeded: %', statement;
end;
$$;

insert into auth.users (id,email,raw_app_meta_data,raw_user_meta_data) values
 ('00000000-0000-4000-a000-000000000001','workflow-customer@example.invalid','{}','{}'),
 ('00000000-0000-4000-a000-000000000002','workflow-other@example.invalid','{}','{}'),
 ('00000000-0000-4000-a000-000000000003','workflow-inspector@example.invalid','{"role":"inspector"}','{}'),
 ('00000000-0000-4000-a000-000000000004','workflow-other-inspector@example.invalid','{"role":"inspector"}','{}'),
 ('00000000-0000-4000-a000-000000000005','workflow-admin@example.invalid','{"role":"admin"}','{}');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);

-- Legitimate customer booking is unassigned and editable before work starts.
insert into public.appointments (id,customer_id,scheduled_at,time_slot,property_address)
values ('00000000-0000-4000-b000-000000000001',auth.uid(),now()+interval '1 day','10 AM','Original address');
update public.appointments set notes='Gate code provided', time_slot='11 AM'
where id='00000000-0000-4000-b000-000000000001';
select pg_temp.expect_denied($q$insert into public.appointments (customer_id,scheduled_at,time_slot,property_address)
 values ('00000000-0000-4000-a000-000000000002',now(),'10 AM','Foreign booking')$q$);
select pg_temp.expect_denied($q$insert into public.appointments (customer_id,inspector_id,scheduled_at,time_slot,property_address)
 values (auth.uid(),'00000000-0000-4000-a000-000000000003',now(),'10 AM','Preassigned')$q$);
select pg_temp.expect_denied($q$insert into public.appointments (customer_id,status,scheduled_at,time_slot,property_address)
 values (auth.uid(),'completed',now(),'10 AM','Forged status')$q$);
select pg_temp.expect_denied($q$update public.appointments set inspector_id='00000000-0000-4000-a000-000000000003'
 where id='00000000-0000-4000-b000-000000000001'$q$);

-- Admin can assign; unrelated customer sees no booking and cannot mutate it.
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000005',true);
update public.appointments set inspector_id='00000000-0000-4000-a000-000000000003'
where id='00000000-0000-4000-b000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000002',true);
do $$
declare affected integer;
begin
 if exists(select 1 from public.appointments where id='00000000-0000-4000-b000-000000000001') then
  raise exception 'FAIL: foreign booking exposed';
 end if;
 update public.appointments set notes='Forbidden' where id='00000000-0000-4000-b000-000000000001';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'FAIL: foreign booking updated'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000003',true);
select pg_temp.expect_denied($q$insert into public.inspections (inspector_id,status) values (auth.uid(),'approved')$q$);
select pg_temp.expect_denied($q$insert into public.inspections (inspector_id)
 values ('00000000-0000-4000-a000-000000000004')$q$);
select pg_temp.expect_denied($q$insert into public.inspections (inspector_id,customer_id)
 values (auth.uid(),'00000000-0000-4000-a000-000000000002')$q$);
select pg_temp.expect_denied($q$insert into public.inspections (inspector_id,approved_at) values (auth.uid(),now())$q$);
select pg_temp.expect_denied($q$insert into public.inspections (inspector_id,deleted_at) values (auth.uid(),now())$q$);

insert into public.inspections (id,inspector_id,customer_id,status) values
 ('00000000-0000-4000-c000-000000000001',auth.uid(),'00000000-0000-4000-a000-000000000001','draft'),
 ('00000000-0000-4000-c000-000000000002',auth.uid(),null,'draft');
select pg_temp.expect_denied($q$update public.appointments set time_slot='Forged'
 where id='00000000-0000-4000-b000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.appointments set status='in_progress'
 where id='00000000-0000-4000-b000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.appointments set status='in_progress',inspection_id='00000000-0000-4000-c000-000000000002'
 where id='00000000-0000-4000-b000-000000000001'$q$);
update public.appointments set status='in_progress',inspection_id='00000000-0000-4000-c000-000000000001'
where id='00000000-0000-4000-b000-000000000001';
select pg_temp.expect_denied($q$update public.appointments set status='completed'
 where id='00000000-0000-4000-b000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.appointments set inspection_id=null
 where id='00000000-0000-4000-b000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.inspections set status='approved'
 where id='00000000-0000-4000-c000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.inspections set rejection_reason='Forged rejection'
 where id='00000000-0000-4000-c000-000000000001'$q$);
select pg_temp.expect_denied($q$update public.inspections set deleted_at=now()
 where id='00000000-0000-4000-c000-000000000001'$q$);
update public.inspections set status='pending' where id='00000000-0000-4000-c000-000000000001';

-- Rejection -> draft retains review metadata; resubmission clears it server-side.
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000005',true);
update public.inspections set status='rejected',rejection_reason='Add evidence',rejected_at=now()
where id='00000000-0000-4000-c000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000003',true);
update public.inspections set status='draft' where id='00000000-0000-4000-c000-000000000001';
update public.inspections set status='pending' where id='00000000-0000-4000-c000-000000000001';
do $$
begin
 if not exists(select 1 from public.inspections where id='00000000-0000-4000-c000-000000000001'
  and status='pending' and rejection_reason is null and rejected_at is null) then
  raise exception 'FAIL: resubmission did not clear review metadata';
 end if;
 if not exists(select 1 from public.appointments where id='00000000-0000-4000-b000-000000000001'
  and inspection_id='00000000-0000-4000-c000-000000000001' and status='in_progress'
  and time_slot='11 AM') then raise exception 'FAIL: start inspection did not preserve booking'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000001',true);
select pg_temp.expect_denied($q$update public.appointments set notes='Late edit'
 where id='00000000-0000-4000-b000-000000000001'$q$);

-- Approved reports cannot be changed by an inspector (RLS hides update target).
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000005',true);
update public.inspections set status='approved' where id='00000000-0000-4000-c000-000000000001';
update public.appointments set status='completed' where id='00000000-0000-4000-b000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000003',true);
do $$
declare affected integer;
begin
 update public.inspections set status='draft' where id='00000000-0000-4000-c000-000000000001';
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'FAIL: approved report changed'; end if;
end $$;
rollback;
\echo 'PASS: booking ownership, assignment, report creation, protected fields, start link, resubmission, approval immutability'

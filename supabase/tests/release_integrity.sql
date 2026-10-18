-- Run in an isolated database after 005; every fixture rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when insufficient_privilege or serialization_failure or unique_violation then return;
 end;
 raise exception 'FAIL: forbidden operation succeeded: %',statement;
end $$;
insert into auth.users(id,email,raw_app_meta_data) values
 ('00000000-0000-4000-a000-000000000011','release-client@example.invalid','{}'),
 ('00000000-0000-4000-a000-000000000012','release-other@example.invalid','{}'),
 ('00000000-0000-4000-a000-000000000013','release-inspector@example.invalid','{"role":"inspector"}'),
 ('00000000-0000-4000-a000-000000000014','release-admin@example.invalid','{"role":"admin"}'),
 ('00000000-0000-4000-a000-000000000015','release-other-staff@example.invalid','{"role":"inspector"}');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000011',true);
insert into public.appointments(id,customer_id,scheduled_at,time_slot,property_address)
 values('00000000-0000-4000-b000-000000000011',auth.uid(),now()+interval '1 day','10 AM','Synthetic property');
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000014',true);
update public.appointments set inspector_id='00000000-0000-4000-a000-000000000013'
 where id='00000000-0000-4000-b000-000000000011';
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000013',true);
select public.persist_inspection('00000000-0000-4000-c000-000000000011',
 '{"inspector_id":"00000000-0000-4000-a000-000000000013","customer_id":"00000000-0000-4000-a000-000000000011","status":"draft","metadata":{"appointmentId":"00000000-0000-4000-b000-000000000011"}}',null);
select pg_temp.assert_true((select inspection_id='00000000-0000-4000-c000-000000000011' and status='in_progress'
 from public.appointments where id='00000000-0000-4000-b000-000000000011'),'atomic appointment handoff');
-- A lost response can retry safely without a second report or audit entry.
select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"draft"}',null);
select pg_temp.expect_denied($q$select public.persist_inspection('00000000-0000-4000-c000-000000000012',
 '{"inspector_id":"00000000-0000-4000-a000-000000000013","customer_id":"00000000-0000-4000-a000-000000000011","metadata":{"appointmentId":"00000000-0000-4000-b000-000000000011"}}',null)$q$);
select pg_temp.assert_true(not exists(select 1 from public.inspections where id='00000000-0000-4000-c000-000000000012'),'duplicate report transaction rolled back');
select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"pending"}',1);
select pg_temp.expect_denied($q$select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"draft"}',1)$q$);
-- The client cannot read a pending report or its private photos.
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000011',true);
select pg_temp.assert_true(not exists(select 1 from public.inspections where id='00000000-0000-4000-c000-000000000011'),'unpublished reports hidden from customer');
select pg_temp.assert_true(not public.can_read_photo('00000000-0000-4000-a000-000000000013/00000000-0000-4000-c000-000000000011/room/p.jpg','00000000-0000-4000-a000-000000000013'),'pending media hidden');
select pg_temp.assert_true(not public.can_write_photo('draft/room/p.jpg'),'customer draft upload denied');
-- Admin rejects; inspector resubmits; only the current revision can approve.
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000014',true);
select pg_temp.expect_denied($q$select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"rejected"}',2)$q$);
select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"rejected","rejection_reason":"Add water evidence"}',2);
select pg_temp.assert_true((select rejected_by::text=auth.uid()::text from public.inspections where id='00000000-0000-4000-c000-000000000011'),'review actor recorded by database');

select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000013',true);
select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"pending"}',3);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000014',true);
select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"approved"}',4);
select pg_temp.assert_true((select approved_by::text=auth.uid()::text and approved_at is not null and rejection_reason is null from public.inspections where id='00000000-0000-4000-c000-000000000011'),'approval stamp and rejection cleanup');
select pg_temp.assert_true((select count(*)=5 from public.inspection_events where inspection_id='00000000-0000-4000-c000-000000000011'),'one audit event per transition');
select pg_temp.assert_true((select status='completed' from public.appointments where id='00000000-0000-4000-b000-000000000011'),'approval completes booking atomically');
select pg_temp.expect_denied($q$select public.persist_inspection('00000000-0000-4000-c000-000000000011','{"status":"rejected","rejection_reason":"Stale review"}',4)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000011',true);
select pg_temp.assert_true((select count(*)=1 from public.inspections where id='00000000-0000-4000-c000-000000000011'),'approved report visible to its customer');
select pg_temp.assert_true(public.can_read_photo('00000000-0000-4000-a000-000000000013/00000000-0000-4000-c000-000000000011/room/p.jpg','00000000-0000-4000-a000-000000000013'),'approved media visible');
select pg_temp.assert_true((select count(*)=1 from public.notifications where data->>'inspectionId'='00000000-0000-4000-c000-000000000011'),'customer notification visible');
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000012',true);
select pg_temp.assert_true(not exists(select 1 from public.inspections where id='00000000-0000-4000-c000-000000000011'),'foreign customer report isolation');
select pg_temp.assert_true(not public.can_read_photo('draft/room/old.jpg','00000000-0000-4000-a000-000000000013'),'legacy draft media isolated');
-- Another inspector cannot delete foreign chats or messages.
reset role;
insert into public.chats(id,participants) values('00000000-0000-4000-d000-000000000011',array['00000000-0000-4000-a000-000000000011'::uuid,'00000000-0000-4000-a000-000000000013'::uuid]);
insert into public.messages(id,chat_id,sender_id,sender_name,content) values('00000000-0000-4000-e000-000000000011','00000000-0000-4000-d000-000000000011','00000000-0000-4000-a000-000000000013','Synthetic Inspector','Test message');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000015',true);
delete from public.chats where id='00000000-0000-4000-d000-000000000011';
delete from public.messages where id='00000000-0000-4000-e000-000000000011';
reset role;
select pg_temp.assert_true((select count(*)=1 from public.chats where id='00000000-0000-4000-d000-000000000011'),'unrelated staff cannot delete chat');
select pg_temp.assert_true((select count(*)=1 from public.messages where id='00000000-0000-4000-e000-000000000011'),'unrelated staff cannot delete message');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-a000-000000000011',true);
select public.mark_message_read('00000000-0000-4000-e000-000000000011');
select pg_temp.assert_true((select auth.uid()=any(read_by) from public.messages),'read receipt works without message rewrite access');
rollback;
\echo 'PASS: booking, assignment, atomic save, idempotency, stale writes, reject/resubmit/approve, audit, notifications, media and chat isolation'

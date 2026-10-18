-- Run with psql against a disposable Supabase database after migration 003:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/profile_role_security.sql
-- All fixtures are rolled back, including on a failed assertion/disconnection.
\set ON_ERROR_STOP on
begin;

-- Exercise the real auth insert trigger with adversarial signup metadata.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values
 ('00000000-0000-4000-a000-000000000091', 'role-test-customer@example.invalid', '{"role":"admin"}', '{}'),
 ('00000000-0000-4000-a000-000000000092', 'role-test-inspector@example.invalid', '{"role":"admin"}', '{"role":"inspector"}'),
 ('00000000-0000-4000-a000-000000000093', 'role-test-admin@example.invalid', '{}', '{"role":"admin"}');

do $$
begin
  if (select role from public.profiles where id = '00000000-0000-4000-a000-000000000091') is distinct from 'customer' then
    raise exception 'FAIL: signup metadata granted privileges';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-000000000092') is distinct from 'inspector' then
    raise exception 'FAIL: trusted inspector provisioning failed';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-000000000093') is distinct from 'admin' then
    raise exception 'FAIL: trusted administrator provisioning failed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000091', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare affected integer;
begin
  update public.profiles set name = 'Allowed self edit' where id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: self edit denied'; end if;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: self promotion permitted';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-000000000093') then
    raise exception 'FAIL: customer can read unrelated admin profile';
  end if;
  update public.profiles set name = 'Forbidden foreign edit'
    where id = '00000000-0000-4000-a000-000000000093';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: foreign profile modified'; end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000092', true);
do $$
begin
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: inspector self promotion permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000093', true);
do $$
declare affected integer;
begin
  update public.profiles set role = 'inspector'
    where id = '00000000-0000-4000-a000-000000000091';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: administrator role change denied'; end if;
end $$;

-- A missing profile must not bypass the guard through SQL NULL semantics.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-000000000099', true);
do $$
begin
  begin
    update public.profiles set role = 'admin'
      where id = '00000000-0000-4000-a000-000000000091';
    raise exception 'FAIL: missing caller profile bypassed role guard';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
\echo 'PASS: signup roles, self edits, denied escalation, profile isolation, admin role changes, missing-profile guard'

-- Minimal Supabase API contracts for isolated PostgreSQL CI only.
-- Do not apply to a hosted project. The runner refuses an existing schema.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create function auth.role() returns text language sql stable as $$
 select nullif(current_setting('request.jwt.claim.role',true),'')
$$;
create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
alter table storage.objects enable row level security;
grant usage on schema auth,storage,public to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
grant select,insert,update,delete on all tables in schema storage to authenticated,service_role;

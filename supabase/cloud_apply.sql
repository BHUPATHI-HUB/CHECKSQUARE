-- =============================================================================
-- CheckSquare — CLOUD one-shot apply (run once in Supabase SQL Editor)
-- =============================================================================
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New query → Run.
-- It is the concatenation, IN THE CORRECT ORDER, of:
--   1. supabase/migrations/001_schema.sql
--   2. supabase/policies/001_rls.sql           (defines public.current_role())
--   3. supabase/migrations/002_auth_and_storage.sql
--   4. storage bucket creation (inspection-photos, reports)
-- Run this on a FRESH project. It is NOT idempotent (create type / create table
-- will error if the objects already exist). If you must re-run, drop the public
-- schema objects first.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- PART 1 — SCHEMA
-- ─────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

create type user_role         as enum ('customer','inspector','admin');
create type inspection_status  as enum ('draft','pending','approved','rejected');
create type appointment_status as enum ('scheduled','in_progress','completed','cancelled');
create type property_type      as enum ('Residential','Commercial','Industrial');
create type chat_type          as enum ('direct','group');
create type report_format      as enum ('pdf','docx','xlsx','other');

create table public.profiles (
    id           uuid primary key references auth.users on delete cascade,
    email        text not null unique,
    name         text not null,
    phone        text,
    address      text,
    avatar_url   text,
    role         user_role not null default 'customer',
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create table public.inspections (
    id                 uuid primary key default gen_random_uuid(),
    inspector_id       uuid not null references public.profiles(id) on delete restrict,
    inspector_name     text,
    customer_id        uuid references public.profiles(id) on delete set null,
    status             inspection_status not null default 'draft',
    property_type      property_type,
    metadata           jsonb not null default '{}'::jsonb,
    area_calculations  jsonb not null default '{}'::jsonb,
    water_quality      jsonb not null default '{}'::jsonb,
    room_inspections   jsonb not null default '{}'::jsonb,
    score              numeric,
    score_breakdown    jsonb,
    approved_by        uuid references public.profiles(id),
    approved_at        timestamptz,
    rejected_by        uuid references public.profiles(id),
    rejected_at        timestamptz,
    rejection_reason   text,
    deleted_at         timestamptz,
    deleted_by         uuid references public.profiles(id),
    deletion_reason    text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create index inspections_inspector_idx on public.inspections (inspector_id);
create index inspections_customer_idx  on public.inspections (customer_id);
create index inspections_status_idx    on public.inspections (status);
create index inspections_deleted_idx   on public.inspections (deleted_at);

create table public.inspection_photos (
    id              uuid primary key default gen_random_uuid(),
    inspection_id   uuid not null references public.inspections(id) on delete cascade,
    room_key        text not null,
    storage_key     text not null,
    caption         text,
    captured_at     timestamptz not null default now(),
    severity        text,
    created_by      uuid references public.profiles(id)
);
create index inspection_photos_insp_idx on public.inspection_photos (inspection_id);

create table public.appointments (
    id               uuid primary key default gen_random_uuid(),
    customer_id      uuid not null references public.profiles(id) on delete cascade,
    inspector_id     uuid references public.profiles(id) on delete set null,
    inspection_id    uuid references public.inspections(id) on delete set null,
    scheduled_at     timestamptz not null,
    time_slot        text not null,
    property_address text not null,
    notes            text,
    status           appointment_status not null default 'scheduled',
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index appointments_customer_idx  on public.appointments (customer_id);
create index appointments_inspector_idx on public.appointments (inspector_id);
create index appointments_scheduled_idx on public.appointments (scheduled_at);
create index appointments_status_idx    on public.appointments (status);

create table public.chats (
    id              uuid primary key default gen_random_uuid(),
    type            chat_type not null default 'direct',
    participants    uuid[] not null,
    inspection_id   uuid references public.inspections(id) on delete set null,
    last_message    text,
    last_message_at timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index chats_participants_gin on public.chats using gin (participants);

create table public.messages (
    id            uuid primary key default gen_random_uuid(),
    chat_id       uuid not null references public.chats(id) on delete cascade,
    sender_id     uuid not null references public.profiles(id) on delete cascade,
    sender_name   text not null,
    sender_role   text,
    content       text not null,
    read_by       uuid[] not null default '{}',
    attachments   jsonb not null default '[]'::jsonb,
    created_at    timestamptz not null default now()
);
create index messages_chat_idx on public.messages (chat_id, created_at);

create table public.notifications (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null references public.profiles(id) on delete cascade,
    type      text not null,
    title     text not null,
    body      text,
    data      jsonb,
    read      boolean not null default false,
    created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

create table public.app_settings (
    id         smallint primary key default 1,
    payload    jsonb not null,
    updated_at timestamptz not null default now(),
    constraint app_settings_singleton check (id = 1)
);

create table public.report_downloads (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    inspection_id uuid references public.inspections(id) on delete set null,
    filename      text not null,
    format        report_format not null,
    file_size     bigint,
    storage_key   text,
    created_at    timestamptz not null default now()
);
create index report_downloads_user_idx on public.report_downloads (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 2 — RLS POLICIES (defines public.current_role())
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles            enable row level security;
alter table public.inspections         enable row level security;
alter table public.inspection_photos   enable row level security;
alter table public.appointments        enable row level security;
alter table public.chats               enable row level security;
alter table public.messages            enable row level security;
alter table public.notifications       enable row level security;
alter table public.app_settings        enable row level security;
alter table public.report_downloads    enable row level security;

-- Defaults to 'customer' when the caller has no profile row yet, so policies
-- that test `current_role() in (...)` never evaluate against NULL and block
-- access unexpectedly.
create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'customer'::user_role
  )
$$;

create policy "self can read own profile"
  on public.profiles for select using (id = auth.uid());
create policy "admins read all profiles"
  on public.profiles for select using (public.current_role() = 'admin');
create policy "inspectors read assigned customers"
  on public.profiles for select using (
    public.current_role() = 'inspector'
    and id in (select customer_id from public.inspections where inspector_id = auth.uid())
  );
create policy "self / admin update profile"
  on public.profiles for update using (id = auth.uid() or public.current_role() = 'admin');

create policy "inspectors / admins create"
  on public.inspections for insert with check (public.current_role() in ('inspector','admin'));
create policy "owners + assignees + admins read"
  on public.inspections for select using (
    public.current_role() = 'admin' or inspector_id = auth.uid() or customer_id = auth.uid()
  );
create policy "owner / admin update while not approved"
  on public.inspections for update using (
    public.current_role() = 'admin' or (inspector_id = auth.uid() and status <> 'approved')
  );
create policy "only admins delete"
  on public.inspections for delete using (public.current_role() = 'admin');

create policy "photos follow inspection visibility"
  on public.inspection_photos for select using (
    exists (select 1 from public.inspections i where i.id = inspection_id
      and (public.current_role() = 'admin' or i.inspector_id = auth.uid() or i.customer_id = auth.uid()))
  );
create policy "photo write follows inspection edit"
  on public.inspection_photos for insert with check (
    exists (select 1 from public.inspections i where i.id = inspection_id
      and (public.current_role() = 'admin' or (i.inspector_id = auth.uid() and i.status <> 'approved')))
  );
create policy "photo delete follows inspection edit"
  on public.inspection_photos for delete using (
    exists (select 1 from public.inspections i where i.id = inspection_id
      and (public.current_role() = 'admin' or (i.inspector_id = auth.uid() and i.status <> 'approved')))
  );

create policy "customers / admins book"
  on public.appointments for insert with check (public.current_role() in ('customer','admin'));
create policy "appointment visibility"
  on public.appointments for select using (
    public.current_role() = 'admin' or customer_id = auth.uid() or inspector_id = auth.uid()
  );
create policy "appointment update"
  on public.appointments for update using (
    public.current_role() = 'admin' or customer_id = auth.uid() or inspector_id = auth.uid()
  );
create policy "only admin delete appt"
  on public.appointments for delete using (public.current_role() = 'admin');

create policy "chat visibility" on public.chats for select
  using (auth.uid() = any(participants) or public.current_role() = 'admin');
create policy "chat insert" on public.chats for insert
  with check (auth.uid() = any(participants));
create policy "chat delete by participant or staff" on public.chats for delete
  using (public.current_role() in ('admin','inspector') or auth.uid() = any(participants));

create policy "messages visible to chat members" on public.messages for select
  using (
    exists (select 1 from public.chats c where c.id = chat_id and auth.uid() = any(c.participants))
    or public.current_role() = 'admin'
  );
create policy "messages insertable by chat members" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.chats c where c.id = chat_id and auth.uid() = any(c.participants))
  );
create policy "message delete by sender / staff" on public.messages for delete
  using (sender_id = auth.uid() or public.current_role() in ('admin','inspector'));

create policy "notifications self" on public.notifications for select using (user_id = auth.uid());
create policy "notifications update self" on public.notifications for update using (user_id = auth.uid());
create policy "notifications delete self" on public.notifications for delete using (user_id = auth.uid());

create policy "settings readable to all authed" on public.app_settings for select
  using (auth.role() = 'authenticated');
create policy "settings write only admin" on public.app_settings for all
  using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

create policy "own downloads only" on public.report_downloads for select
  using (user_id = auth.uid() or public.current_role() = 'admin');
create policy "downloads insert self" on public.report_downloads for insert
  with check (user_id = auth.uid());
create policy "downloads delete self / admin" on public.report_downloads for delete
  using (user_id = auth.uid() or public.current_role() = 'admin');

-- ─────────────────────────────────────────────────────────────────────────
-- PART 3 — AUTH TRIGGERS + STORAGE POLICIES
-- ─────────────────────────────────────────────────────────────────────────
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

drop policy if exists "inspection_photos_read"   on storage.objects;
drop policy if exists "inspection_photos_write"  on storage.objects;
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

-- reports bucket: users read/insert/delete their own report files.
drop policy if exists "reports_read"   on storage.objects;
drop policy if exists "reports_write"  on storage.objects;
drop policy if exists "reports_delete" on storage.objects;

create policy "reports_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'reports'
    and (public.current_role() = 'admin' or owner = auth.uid()));
create policy "reports_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'reports' and owner = auth.uid());
create policy "reports_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'reports'
    and (public.current_role() = 'admin' or owner = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────
-- PART 4 — STORAGE BUCKETS (private)
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

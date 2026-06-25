-- =============================================================================
-- CheckSquare — Phase-3 Postgres schema (Supabase)
-- =============================================================================
-- This SQL is informational for the FUTURE migration of CheckSquare's seven
-- PocketBase collections to Supabase Postgres.  It is NOT executed by the
-- Phase-1 side-car PoC (Storage + Auth) — apply it only when you decide to
-- move the system of record off PocketBase.
--
-- Apply with:   psql "$SUPABASE_DB_URL" < supabase/migrations/001_schema.sql
-- =============================================================================

create extension if not exists "pgcrypto";

-- ─── enums ────────────────────────────────────────────────────────────────
create type user_role        as enum ('customer','inspector','admin');
create type inspection_status as enum ('draft','pending','approved','rejected');
create type appointment_status as enum ('scheduled','in_progress','completed','cancelled');
create type property_type     as enum ('Residential','Commercial','Industrial');
create type chat_type         as enum ('direct','group');
create type report_format     as enum ('pdf','docx','xlsx','other');

-- ─── users (mirrors PocketBase users) ─────────────────────────────────────
-- In production Supabase Auth populates auth.users; this is the profile
-- table joined 1-1 by id = auth.users.id.
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

-- ─── inspections ──────────────────────────────────────────────────────────
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
    -- Photos no longer live here; they live in the inspection_photos table.
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

-- ─── inspection_photos (normalised — fixes gap A1) ────────────────────────
create table public.inspection_photos (
    id              uuid primary key default gen_random_uuid(),
    inspection_id   uuid not null references public.inspections(id) on delete cascade,
    room_key        text not null,
    storage_key     text not null,          -- path in inspection-photos bucket
    caption         text,
    captured_at     timestamptz not null default now(),
    severity        text,
    created_by      uuid references public.profiles(id)
);
create index inspection_photos_insp_idx on public.inspection_photos (inspection_id);

-- ─── appointments ─────────────────────────────────────────────────────────
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

-- ─── chats / messages / notifications ─────────────────────────────────────
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

-- ─── app_settings (single-row) ────────────────────────────────────────────
create table public.app_settings (
    id         smallint primary key default 1,
    payload    jsonb not null,
    updated_at timestamptz not null default now(),
    constraint app_settings_singleton check (id = 1)
);

-- ─── report_downloads ────────────────────────────────────────────────────
create table public.report_downloads (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    inspection_id uuid references public.inspections(id) on delete set null,
    filename      text not null,
    format        report_format not null,
    file_size     bigint,
    storage_key   text,                                  -- key in 'reports' bucket
    created_at    timestamptz not null default now()
);
create index report_downloads_user_idx on public.report_downloads (user_id, created_at desc);

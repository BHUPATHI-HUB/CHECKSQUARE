-- Inspector activity history. Store references and lightweight metadata only;
-- generated PDFs remain in report storage.
create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  session_id text,
  inspection_id uuid,
  property_name text,
  property_address text,
  app_version text,
  device_type text,
  connectivity text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_activity_events_user_time_idx
  on public.user_activity_events (user_id, occurred_at desc);
create index if not exists user_activity_events_inspection_idx
  on public.user_activity_events (inspection_id, occurred_at desc);

alter table public.user_activity_events enable row level security;

create policy "Users can insert their own activity"
  on public.user_activity_events for insert
  with check (auth.uid() = user_id);

create policy "Admins can read activity"
  on public.user_activity_events for select
  using (exists (
    select 1 from public.profiles u
    where u.id = auth.uid() and u.role = 'admin'
  ));

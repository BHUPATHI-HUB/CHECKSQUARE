-- Durable report upload state and integrity checks.
-- Apply after 004_appointment_lifecycle.sql.
begin;

alter table public.report_downloads
  add column if not exists sync_status text not null default 'synced',
  add column if not exists sync_attempts integer not null default 0,
  add column if not exists last_sync_error text,
  add column if not exists synced_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.report_downloads
  drop constraint if exists report_downloads_sync_status_check;

alter table public.report_downloads
  add constraint report_downloads_sync_status_check
  check (sync_status in ('pending', 'synced', 'failed'));

alter table public.report_downloads
  drop constraint if exists report_downloads_sync_attempts_nonnegative;

alter table public.report_downloads
  add constraint report_downloads_sync_attempts_nonnegative
  check (sync_attempts >= 0);

create index if not exists report_downloads_sync_status_idx
  on public.report_downloads (sync_status, updated_at desc);

drop policy if exists "downloads insert self" on public.report_downloads;
create policy "downloads insert self" on public.report_downloads for insert
  with check (
    user_id = auth.uid()
    and (
      inspection_id is null
      or public.current_role() = 'admin'
      or exists (
        select 1 from public.inspections i
        where i.id = inspection_id
          and (i.customer_id = auth.uid() or i.inspector_id = auth.uid())
      )
    )
  );

drop policy if exists "downloads update self / admin" on public.report_downloads;
create policy "downloads update self / admin" on public.report_downloads for update
  using (user_id = auth.uid() or public.current_role() = 'admin')
  with check (user_id = auth.uid() or public.current_role() = 'admin');

create or replace function public.touch_report_download()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_report_download on public.report_downloads;
create trigger touch_report_download
before update on public.report_downloads
for each row execute function public.touch_report_download();

commit;

-- =============================================================================
-- CheckSquare — Phase-3 RLS policies (Supabase)
-- =============================================================================
-- Mirrors the PocketBase API rules so authorisation semantics are identical
-- after the Phase-3 cutover.  Apply AFTER 001_schema.sql.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.inspections         enable row level security;
alter table public.inspection_photos   enable row level security;
alter table public.appointments        enable row level security;
alter table public.chats               enable row level security;
alter table public.messages            enable row level security;
alter table public.notifications       enable row level security;
alter table public.app_settings        enable row level security;
alter table public.report_downloads    enable row level security;

-- Helper: role of the currently-authenticated user.
create or replace function public.current_role() returns user_role
language sql stable as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─── profiles ─────────────────────────────────────────────────────────────
-- Tightened version of PocketBase users.listRule (fixes security gap S1).
create policy "self can read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "admins read all profiles"
  on public.profiles for select
  using (public.current_role() = 'admin');

create policy "inspectors read assigned customers"
  on public.profiles for select
  using (
    public.current_role() = 'inspector'
    and id in (
      select customer_id from public.inspections where inspector_id = auth.uid()
    )
  );

create policy "self / admin update profile"
  on public.profiles for update
  using (id = auth.uid() or public.current_role() = 'admin');

-- ─── inspections ──────────────────────────────────────────────────────────
create policy "inspectors / admins create"
  on public.inspections for insert
  with check (public.current_role() in ('inspector','admin'));

create policy "owners + assignees + admins read"
  on public.inspections for select
  using (
    public.current_role() = 'admin'
    or inspector_id = auth.uid()
    or customer_id  = auth.uid()
  );

create policy "owner / admin update while not approved"
  on public.inspections for update
  using (
    public.current_role() = 'admin'
    or (inspector_id = auth.uid() and status <> 'approved')
  );

create policy "only admins delete"
  on public.inspections for delete
  using (public.current_role() = 'admin');

-- ─── inspection_photos ────────────────────────────────────────────────────
create policy "photos follow inspection visibility"
  on public.inspection_photos for select
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.current_role() = 'admin'
          or i.inspector_id = auth.uid()
          or i.customer_id  = auth.uid()
        )
    )
  );

create policy "photo write follows inspection edit"
  on public.inspection_photos for insert
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (public.current_role() = 'admin'
             or (i.inspector_id = auth.uid() and i.status <> 'approved'))
    )
  );

create policy "photo delete follows inspection edit"
  on public.inspection_photos for delete
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (public.current_role() = 'admin'
             or (i.inspector_id = auth.uid() and i.status <> 'approved'))
    )
  );

-- ─── appointments ─────────────────────────────────────────────────────────
create policy "customers / admins book"
  on public.appointments for insert
  with check (public.current_role() in ('customer','admin'));

create policy "appointment visibility"
  on public.appointments for select
  using (
    public.current_role() = 'admin'
    or customer_id  = auth.uid()
    or inspector_id = auth.uid()
  );

create policy "appointment update"
  on public.appointments for update
  using (
    public.current_role() = 'admin'
    or customer_id  = auth.uid()
    or inspector_id = auth.uid()
  );

create policy "only admin delete appt"
  on public.appointments for delete using (public.current_role() = 'admin');

-- ─── chats / messages / notifications ────────────────────────────────────
create policy "chat visibility" on public.chats for select
  using (auth.uid() = any(participants) or public.current_role() = 'admin');

create policy "chat insert" on public.chats for insert
  with check (auth.uid() = any(participants));

create policy "chat delete by participant or staff" on public.chats for delete
  using (
    public.current_role() in ('admin','inspector')
    or auth.uid() = any(participants)
  );

create policy "messages visible to chat members" on public.messages for select
  using (
    exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() = any(c.participants)
    )
    or public.current_role() = 'admin'
  );

create policy "messages insertable by chat members" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chats c
      where c.id = chat_id and auth.uid() = any(c.participants)
    )
  );

create policy "message delete by sender / staff" on public.messages for delete
  using (
    sender_id = auth.uid() or public.current_role() in ('admin','inspector')
  );

create policy "notifications self" on public.notifications for select using (user_id = auth.uid());
create policy "notifications update self" on public.notifications for update using (user_id = auth.uid());
create policy "notifications delete self" on public.notifications for delete using (user_id = auth.uid());

-- ─── app_settings ─────────────────────────────────────────────────────────
create policy "settings readable to all authed" on public.app_settings for select
  using (auth.role() = 'authenticated');

create policy "settings write only admin" on public.app_settings for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ─── report_downloads ────────────────────────────────────────────────────
create policy "own downloads only" on public.report_downloads for select
  using (user_id = auth.uid() or public.current_role() = 'admin');

create policy "downloads insert self" on public.report_downloads for insert
  with check (user_id = auth.uid());

create policy "downloads delete self / admin" on public.report_downloads for delete
  using (user_id = auth.uid() or public.current_role() = 'admin');

-- ─── Storage bucket policies (apply via Supabase Dashboard or REST) ──────
-- Bucket `inspection-photos` is PRIVATE.  Reads & writes go through signed
-- URLs minted by the PocketBase hook, so a permissive policy is fine while
-- PocketBase still gates the mint.  After the Phase-3 cutover, replace
-- with policies keyed on inspection ownership similar to inspection_photos.

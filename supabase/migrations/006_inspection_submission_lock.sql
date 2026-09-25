-- Inspection submission retention and lock. Apply after 005_report_document_lifecycle.sql.
-- Submitted inspections remain locally mirrored after sync. Inspectors may
-- edit only drafts or reports explicitly rejected by an administrator.
begin;

alter table public.inspections
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by text;

update public.inspections
   set submitted_at = coalesce(submitted_at, updated_at, created_at),
       submitted_by = coalesce(submitted_by, inspector_id::text)
 where status <> 'draft'::inspection_status;

create index if not exists inspections_submitted_idx
  on public.inspections (submitted_at desc);

create or replace function public.protect_inspection_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' then
    if public.current_role() = 'admin' then
      if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        new.approved_by := auth.uid(); new.approved_at := now();
      elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        new.rejected_by := auth.uid(); new.rejected_at := now();
      end if;
    elsif tg_op = 'UPDATE' and (
      new.inspector_id is distinct from old.inspector_id or new.customer_id is distinct from old.customer_id
      or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
      or new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) then
      raise exception 'Only administrators may change inspection ownership or approval fields' using errcode = '42501';
    end if;
  end if;

  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.submitted_at := now();
    new.submitted_by := coalesce(auth.uid()::text, new.inspector_id::text);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_inspection_workflow on public.inspections;
create trigger protect_inspection_workflow
before insert or update on public.inspections
for each row execute function public.protect_inspection_workflow();

drop policy if exists "owner / admin update while not approved" on public.inspections;
create policy "owner / admin update while not approved" on public.inspections for update to authenticated
using (public.current_role() = 'admin' or (inspector_id = auth.uid() and status in ('draft','rejected')))
with check (public.current_role() = 'admin' or
  (public.current_role() = 'inspector' and inspector_id = auth.uid() and status in ('draft','pending')));

drop policy if exists "inspectors / admins create" on public.inspections;
create policy "inspectors / admins create" on public.inspections for insert to authenticated
with check (public.current_role() = 'admin' or
  (public.current_role() = 'inspector' and inspector_id = auth.uid()
   and status in ('draft','pending') and approved_by is null and approved_at is null
   and deleted_at is null));

commit;

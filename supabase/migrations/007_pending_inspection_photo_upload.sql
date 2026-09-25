-- Storage ownership rules plus post-submission insert for offline photo sync.
-- Self-contained because older cloud deployments may not have applied the
-- photo policy section of 003_security_and_app_support.sql.
begin;

create or replace function public.can_access_inspection_photo(object_name text, writing boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.current_role() = 'admin'
    or (split_part(object_name, '/', 1) = 'draft'
        and split_part(object_name, '/', 2) = auth.uid()::text
        and public.current_role() = 'inspector')
    or exists (select 1 from public.inspections i where i.id::text = split_part(object_name, '/', 1)
      and ((writing and i.inspector_id = auth.uid() and i.status in ('draft','rejected'))
        or (not writing and (i.inspector_id = auth.uid() or i.customer_id = auth.uid())))));
$$;

create or replace function public.can_insert_inspection_photo(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_access_inspection_photo(object_name, true)
    or (public.current_role() = 'inspector' and exists (
      select 1 from public.inspections i
      where i.id::text = split_part(object_name, '/', 1)
        and i.inspector_id = auth.uid()
        and i.status = 'pending'::inspection_status
    ));
$$;

drop policy if exists "inspection_photos_read" on storage.objects;
drop policy if exists "inspection_photos_write" on storage.objects;
drop policy if exists "inspection_photos_update" on storage.objects;
drop policy if exists "inspection_photos_delete" on storage.objects;
create policy "inspection_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, false));
create policy "inspection_photos_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos' and public.can_insert_inspection_photo(name));
create policy "inspection_photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, true))
  with check (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, true));
create policy "inspection_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'inspection-photos' and public.can_access_inspection_photo(name, true));

commit;

-- Keep conversation attachments private to members of that conversation.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 20971520)
on conflict (id) do nothing;

create policy "chat_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.chats c
      where c.id::text = split_part(name, '/', 1)
        and (select auth.uid()) = any(c.participants)
    )
  );

create policy "chat_attachments_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.chats c
      where c.id::text = split_part(name, '/', 1)
        and ((select auth.uid()) = any(c.participants)
          or checksquare_private.current_role() = 'admin')
    )
  );

create policy "chat_attachments_cleanup"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and owner_id = (select auth.uid())::text
  );

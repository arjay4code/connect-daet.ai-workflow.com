alter table public.workflow_message_attachments
  drop constraint if exists workflow_message_attachments_file_size_check;

alter table public.workflow_message_attachments
  add constraint workflow_message_attachments_file_size_check
  check (file_size > 0 and file_size <= 104857600);

update storage.buckets
set file_size_limit = 104857600
where id in ('workflow_uploads', 'workflow_message_attachments');

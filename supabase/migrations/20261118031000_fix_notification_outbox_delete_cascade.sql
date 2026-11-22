alter table public.workflow_email_outbox
  drop constraint if exists workflow_email_outbox_notification_id_fkey;

alter table public.workflow_email_outbox
  add constraint workflow_email_outbox_notification_id_fkey
  foreign key (notification_id)
  references public.workflow_notifications(id)
  on delete cascade;

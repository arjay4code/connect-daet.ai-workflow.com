begin;

create or replace function public.queue_workflow_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_email text;
  recipient_role text;
  recipient_name text;
  submission_user_id uuid;
  submission_status text;
  document_reference text;
  action_path text;
begin
  select submission.user_id, submission.status, submission.tracking_number
    into submission_user_id, submission_status, document_reference
  from public.workflow_submissions submission
  where submission.id = new.submission_id;

  if new.recipient_id = submission_user_id
    and (
      new.event_type is distinct from 'SUBMISSION_CLOSED'
      or submission_status is distinct from 'completed'
    ) then
    return new;
  end if;

  select profile.email, profile.role, nullif(btrim(profile.full_name), '')
    into recipient_email, recipient_role, recipient_name
  from public.profiles profile
  where profile.id = new.recipient_id;

  if nullif(btrim(recipient_email), '') is null then
    return new;
  end if;

  action_path := case recipient_role
    when 'submitter' then '/workflow/user/file_registry/' || new.submission_id::text
    when 'system_admin' then '/workflow/admin/submissions/' || new.submission_id::text
    when 'tourism_officer' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'municipal_treasurer' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'mayor_office' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'sangguniang_bayan' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'user' then '/workflow/user/file_registry/' || new.submission_id::text
    when 'admin' then '/workflow/admin/submissions/' || new.submission_id::text
    when 'approver' then '/workflow/reviewer/file_management/' || new.submission_id::text
    else '/workflow'
  end;

  insert into public.workflow_email_outbox (
    notification_id,
    recipient_id,
    recipient_email,
    subject,
    body,
    event_type,
    notification_title,
    document_reference,
    action_path,
    recipient_name
  )
  values (
    new.id,
    new.recipient_id,
    recipient_email,
    'CONNECT-Daet: ' || new.title,
    new.message,
    new.event_type,
    new.title,
    document_reference,
    action_path,
    recipient_name
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

update public.workflow_email_outbox email
set subject = 'CONNECT-Daet: ' || notification.title,
    last_updated_at = timezone('utc', now())
from public.workflow_notifications notification
join public.workflow_submissions submission
  on submission.id = notification.submission_id
where email.notification_id = notification.id
  and email.recipient_id = submission.user_id
  and notification.event_type = 'SUBMISSION_CLOSED'
  and submission.status = 'completed'
  and email.status in ('queued', 'processing');

update public.workflow_email_outbox email
set status = 'failed',
    failed_at = coalesce(email.failed_at, timezone('utc', now())),
    is_retryable = false,
    last_error = 'Suppressed by requester completion-only email policy',
    claimed_by = null,
    lease_expires_at = null,
    last_updated_at = timezone('utc', now())
from public.workflow_notifications notification
join public.workflow_submissions submission
  on submission.id = notification.submission_id
where email.notification_id = notification.id
  and email.recipient_id = submission.user_id
  and (
    notification.event_type is distinct from 'SUBMISSION_CLOSED'
    or submission.status is distinct from 'completed'
  )
  and email.status in ('queued', 'processing', 'failed');

commit;

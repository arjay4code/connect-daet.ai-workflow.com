update public.workflow_email_outbox as email
set action_path = case profile.role
  when 'submitter' then '/workflow/user/file_registry/' || submission.id::text
  when 'system_admin' then '/workflow/admin/submissions/' || submission.id::text
  when 'tourism_officer' then '/workflow/reviewer/file_management/' || submission.id::text
  when 'municipal_treasurer' then '/workflow/reviewer/file_management/' || submission.id::text
  when 'mayor_office' then '/workflow/reviewer/file_management/' || submission.id::text
  when 'sangguniang_bayan' then '/workflow/reviewer/file_management/' || submission.id::text
  when 'user' then '/workflow/user/file_registry/' || submission.id::text
  when 'admin' then '/workflow/admin/submissions/' || submission.id::text
  when 'approver' then '/workflow/reviewer/file_management/' || submission.id::text
  else '/workflow'
end
from public.profiles profile
join public.workflow_notifications notification
  on notification.recipient_id = profile.id
join public.workflow_submissions submission
  on submission.id = notification.submission_id
where email.notification_id = notification.id
  and email.recipient_id = profile.id
  and email.status in ('queued', 'failed');

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
  document_reference text;
  action_path text;
begin
  select profile.email, profile.role, nullif(btrim(profile.full_name), '')
    into recipient_email, recipient_role, recipient_name
  from public.profiles profile
  where profile.id = new.recipient_id;

  if nullif(btrim(recipient_email), '') is null then
    return new;
  end if;

  select submission.tracking_number
    into document_reference
  from public.workflow_submissions submission
  where submission.id = new.submission_id;

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
    'Docuflow: ' || new.title,
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

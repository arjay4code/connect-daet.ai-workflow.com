alter table public.workflow_submissions
  add column if not exists request_title text;

create or replace function public.create_workflow_submission(
  submission_title text,
  submission_file_path text,
  submission_file_url text,
  submission_file_type text,
  submission_file_size bigint,
  submission_document_type text,
  submission_description text,
  submission_purpose text,
  submission_requested_action text,
  submission_intended_recipient text,
  submission_office_role text,
  attachment_records jsonb default '[]'::jsonb,
  submission_other_document_type text default null
)
returns table (id uuid, tracking_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.workflow_mvp_active_role();
  created_submission public.workflow_submissions;
  attachment_record record;
  normalized_other_document_type text := nullif(btrim(submission_other_document_type), '');
  now_at timestamptz := timezone('utc', now());
begin
  if actor_role is distinct from 'submitter' then
    raise exception 'Only a submitter can create a workflow submission';
  end if;
  if coalesce(length(btrim(submission_title)), 0) = 0
    or coalesce(length(btrim(submission_file_path)), 0) = 0
    or coalesce(length(btrim(submission_document_type)), 0) = 0
    or submission_file_size is null
    or submission_file_size < 1 then
    raise exception 'A document filename, document, and document type are required';
  end if;
  if submission_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'Select a valid destination office';
  end if;
  if not exists (
    select 1
    from public.workflow_office_document_types document_type
    where document_type.office_role = submission_office_role
      and document_type.document_type = submission_document_type
  ) then
    raise exception 'Select a document type available for the destination office';
  end if;
  if submission_document_type = 'Other' then
    if normalized_other_document_type is null
      or length(normalized_other_document_type) > 120 then
      raise exception 'Specify the document type using no more than 120 characters';
    end if;
  elsif normalized_other_document_type is not null then
    raise exception 'A custom document type is only allowed when Other is selected';
  end if;
  if submission_file_path not like (auth.uid()::text || '/%')
    or attachment_records is null
    or jsonb_typeof(attachment_records) is distinct from 'array' then
    raise exception 'Invalid document storage path or attachment list';
  end if;

  insert into public.workflow_submissions (
    user_id, file_url, file_path, file_name, request_title, file_size, file_type, category,
    other_document_type, description, purpose, requested_action, intended_recipient,
    selected_office_role, initial_destination_role, status, updated_at
  )
  values (
    auth.uid(), submission_file_url, submission_file_path, submission_title,
    case
      when submission_document_type = 'Other' then normalized_other_document_type
      else submission_document_type
    end,
    submission_file_size, submission_file_type, submission_document_type,
    normalized_other_document_type, nullif(btrim(submission_description), ''),
    nullif(btrim(submission_purpose), ''),
    nullif(btrim(submission_requested_action), ''),
    nullif(btrim(submission_intended_recipient), ''),
    submission_office_role, submission_office_role, 'submitted', now_at
  )
  returning * into created_submission;

  insert into public.workflow_submission_versions (
    submission_id, version_number, file_name, file_path, file_type, file_size, uploaded_by
  )
  values (
    created_submission.id, 1, created_submission.file_name, created_submission.file_path,
    created_submission.file_type, created_submission.file_size, auth.uid()
  );

  for attachment_record in
    select *
    from jsonb_to_recordset(attachment_records) as attachment(
      file_name text, file_path text, file_type text, file_size bigint
    )
  loop
    if coalesce(length(btrim(attachment_record.file_name)), 0) = 0
      or attachment_record.file_path not like (auth.uid()::text || '/%')
      or attachment_record.file_size is null
      or attachment_record.file_size < 0 then
      raise exception 'Invalid supporting attachment metadata';
    end if;

    insert into public.workflow_submission_attachments (
      submission_id, file_name, file_path, file_type, file_size, uploaded_by
    )
    values (
      created_submission.id, attachment_record.file_name, attachment_record.file_path,
      attachment_record.file_type, attachment_record.file_size, auth.uid()
    );
  end loop;

  perform public.workflow_mvp_record_history(
    created_submission.id, 'DESTINATION_SELECTED', null, 'submitted',
    'Initial destination selected by submitter: ' || submission_office_role, now_at
  );

  insert into public.workflow_notifications (
    recipient_id, submission_id, event_type, title, message
  )
  select
    profile.id,
    created_submission.id,
    'DESTINATION_SELECTED',
    'New submission routed to your office',
    coalesce(created_submission.tracking_number, 'Pending tracking number')
      || ' — ' || created_submission.request_title
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.role = submission_office_role
    and profile.is_active
    and (account.banned_until is null or account.banned_until <= now_at)
  on conflict (recipient_id, submission_id, event_type, title, message) do nothing;

  return query select created_submission.id, created_submission.tracking_number;
end;
$$;

create or replace function public.workflow_notification_use_request_title()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.workflow_submissions;
begin
  if new.submission_id is null or new.message is null then
    return new;
  end if;

  select * into submission
  from public.workflow_submissions
  where id = new.submission_id;

  if found and submission.request_title is not null and submission.file_name is not null then
    new.message := replace(new.message, submission.file_name, submission.request_title);
  end if;

  return new;
end;
$$;

drop trigger if exists workflow_notification_use_request_title
  on public.workflow_notifications;

create trigger workflow_notification_use_request_title
before insert on public.workflow_notifications
for each row
execute function public.workflow_notification_use_request_title();

create or replace function public.get_workflow_retrieval_by_token(scanned_token uuid)
returns table (
  submission_id uuid,
  request_reference text,
  document_title text,
  requester_full_name text,
  document_type text,
  processing_status text,
  office_role text,
  retrieval_status text,
  department_section text,
  room text,
  cabinet text,
  shelf text,
  drawer text,
  folder_box text,
  received_at timestamptz,
  assigned_officer_name text,
  latest_update timestamptz,
  released_at timestamptz,
  releasing_officer_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  target_retrieval public.workflow_document_retrievals;
begin
  actor_role := public.current_profile_role();
  if auth.uid() is null
    or actor_role is null
    or actor_role not in ('municipal_treasurer', 'mayor_office', 'sangguniang_bayan') then
    raise exception 'Only authorized municipal officers can scan document retrieval QR codes';
  end if;

  select *
  into target_retrieval
  from public.workflow_document_retrievals retrieval
  where retrieval.qr_token = scanned_token
    and retrieval.status in ('active', 'released')
    and retrieval.expires_at > now();

  if not found then
    raise exception 'This QR code is invalid, expired, or no longer active';
  end if;

  if target_retrieval.office_role <> actor_role then
    raise exception 'This request is assigned to a different municipal office';
  end if;

  insert into public.workflow_document_retrieval_events (
    submission_id, actor_id, actor_role, action_type
  )
  values (
    target_retrieval.submission_id, auth.uid(), actor_role, 'QR_SCANNED'
  );

  insert into public.workflow_audit_logs (
    submission_id, action_by, action_type, comments
  )
  values (
    target_retrieval.submission_id,
    auth.uid(),
    'RETRIEVAL_QR_SCANNED',
    'Retrieval QR code scanned by the assigned municipal office.'
  );

  return query
  select
    submission.id,
    submission.tracking_number,
    coalesce(submission.request_title, submission.file_name),
    coalesce(nullif(btrim(requester.full_name), ''), 'Unknown requester'),
    submission.category,
    case
      when target_retrieval.status = 'released' then 'Released'
      else submission.status
    end,
    target_retrieval.office_role,
    target_retrieval.status,
    target_retrieval.department_section,
    target_retrieval.room,
    target_retrieval.cabinet,
    target_retrieval.shelf,
    target_retrieval.drawer,
    target_retrieval.folder_box,
    target_retrieval.received_at,
    coalesce(
      nullif(btrim(location_officer.full_name), ''),
      nullif(btrim(assigned_officer.full_name), '')
    ),
    greatest(
      submission.updated_at,
      coalesce(target_retrieval.location_updated_at, target_retrieval.generated_at),
      target_retrieval.updated_at
    ),
    target_retrieval.released_at,
    nullif(btrim(releasing_officer.full_name), '')
  from public.workflow_submissions submission
  join public.profiles requester on requester.id = submission.user_id
  left join public.profiles location_officer
    on location_officer.id = target_retrieval.location_updated_by
  left join lateral (
    select profile.full_name
    from public.workflow_routing_plans plan
    join public.workflow_routing_steps step on step.routing_plan_id = plan.id
    left join public.profiles profile on profile.id = step.decided_by
    where plan.submission_id = submission.id
      and plan.is_current
      and plan.status = 'finalized'
      and step.office_role = target_retrieval.office_role
      and step.status = 'approved'
    order by step.sequence_number desc
    limit 1
  ) assigned_officer on true
  left join public.profiles releasing_officer
    on releasing_officer.id = target_retrieval.released_by
  where submission.id = target_retrieval.submission_id;
end;
$$;

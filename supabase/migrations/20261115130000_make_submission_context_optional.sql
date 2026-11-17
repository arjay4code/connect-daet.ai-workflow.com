begin;

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
    raise exception 'Title, document, and document type are required';
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
    user_id, file_url, file_path, file_name, file_size, file_type, category,
    other_document_type, description, purpose, requested_action, intended_recipient,
    selected_office_role, initial_destination_role, status, updated_at
  )
  values (
    auth.uid(), submission_file_url, submission_file_path, submission_title,
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
      || ' — ' || created_submission.file_name
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.role = submission_office_role
    and profile.is_active
    and (account.banned_until is null or account.banned_until <= now_at)
  on conflict (recipient_id, submission_id, event_type, title, message) do nothing;

  return query select created_submission.id, created_submission.tracking_number;
end;
$$;

revoke all on function public.create_workflow_submission(
  text, text, text, text, bigint, text, text, text, text, text, text, jsonb, text
) from public, anon;
grant execute on function public.create_workflow_submission(
  text, text, text, text, bigint, text, text, text, text, text, text, jsonb, text
) to authenticated;

commit;

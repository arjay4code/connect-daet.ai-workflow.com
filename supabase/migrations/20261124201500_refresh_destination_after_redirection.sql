create or replace function public.redirect_workflow_submission(
  target_submission_id uuid,
  target_office_role text,
  new_document_type text,
  new_other_document_type text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.workflow_mvp_active_role();
  submission public.workflow_submissions;
  normalized_other_document_type text := nullif(btrim(new_other_document_type), '');
  now_at timestamptz := timezone('utc', now());
begin
  if actor_role is distinct from 'submitter' then
    raise exception 'Only the submitter can redirect a returned submission';
  end if;
  if target_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'Select a permitted destination office';
  end if;
  if not exists (
    select 1
    from public.workflow_office_document_types document_type
    where document_type.office_role = target_office_role
      and document_type.document_type = new_document_type
  ) then
    raise exception 'Select a document type available for the new destination';
  end if;
  if new_document_type = 'Other' then
    if normalized_other_document_type is null
      or length(normalized_other_document_type) > 120 then
      raise exception 'Specify the document type using no more than 120 characters';
    end if;
  elsif normalized_other_document_type is not null then
    raise exception 'A custom document type is only allowed when Other is selected';
  end if;

  select * into submission
  from public.workflow_submissions
  where id = target_submission_id
    and user_id = auth.uid()
  for update;
  if not found or submission.status <> 'returned' then
    raise exception 'This submission is not waiting for redirection';
  end if;
  if public.workflow_mvp_has_pending_assignment(target_submission_id) then
    raise exception 'Pending office assignments must be withdrawn before redirecting';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    join auth.users account on account.id = profile.id
    where profile.role = target_office_role
      and profile.is_active
      and (account.banned_until is null or account.banned_until <= now_at)
  ) then
    raise exception 'The selected office has no active representatives';
  end if;

  perform set_config('app.workflow_authorized_transition', 'on', true);
  update public.workflow_submissions
  set status = 'submitted',
      selected_office_role = target_office_role,
      initial_destination_role = target_office_role,
      final_decision_office_role = case
        when target_office_role = 'tourism_officer' then null
        else target_office_role
      end,
      category = new_document_type,
      other_document_type = normalized_other_document_type,
      office_comments = null,
      mayor_comments = null,
      sender_response = null,
      updated_at = now_at
  where id = target_submission_id;
  perform set_config('app.workflow_authorized_transition', 'off', true);

  perform public.workflow_mvp_record_history(
    target_submission_id, 'SUBMISSION_REDIRECTED', 'returned', 'submitted',
    'Destination changed from ' || coalesce(submission.selected_office_role, 'unknown')
      || ' to ' || target_office_role || '; document type: ' || new_document_type,
    now_at
  );

  insert into public.workflow_notifications (
    recipient_id, submission_id, event_type, title, message
  )
  select
    profile.id, target_submission_id, 'SUBMISSION_REDIRECTED',
    'Submission redirected to your office',
    coalesce(submission.tracking_number, 'Pending tracking number')
      || ' — ' || submission.file_name
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.role = target_office_role
    and profile.is_active
    and (account.banned_until is null or account.banned_until <= now_at)
  on conflict (recipient_id, submission_id, event_type, title, message) do nothing;
end;
$$;

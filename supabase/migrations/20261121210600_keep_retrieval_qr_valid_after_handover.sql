create or replace function public.update_workflow_document_location(
  target_submission_id uuid,
  location_department_section text,
  location_room text,
  location_cabinet text,
  location_shelf text,
  location_drawer text,
  location_folder_box text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  retrieval public.workflow_document_retrievals;
begin
  actor_role := public.current_profile_role();
  if auth.uid() is null
    or actor_role is null
    or actor_role not in (
      'tourism_officer',
      'municipal_treasurer',
      'mayor_office',
      'sangguniang_bayan'
    ) then
    raise exception 'Only authorized office staff can update document storage locations';
  end if;

  if exists (
    select 1
    from unnest(array[
      location_department_section, location_shelf, location_folder_box
    ]) as locations(value)
    where length(coalesce(value, '')) > 200
  ) then
    raise exception 'Each storage location field must be 200 characters or fewer';
  end if;

  select *
  into retrieval
  from public.workflow_document_retrievals
  where submission_id = target_submission_id
  for update;

  if not found
    or retrieval.office_role <> actor_role
    or retrieval.status not in ('active', 'released')
    or retrieval.expires_at <= now() then
    raise exception 'A valid retrieval record assigned to your office is required';
  end if;

  update public.workflow_document_retrievals
  set department_section = nullif(btrim(location_department_section), ''),
      room = null,
      cabinet = null,
      shelf = nullif(btrim(location_shelf), ''),
      drawer = null,
      folder_box = nullif(btrim(location_folder_box), ''),
      received_at = coalesce(received_at, now()),
      location_updated_at = now(),
      location_updated_by = auth.uid(),
      updated_at = now()
  where submission_id = target_submission_id;

  insert into public.workflow_document_retrieval_events (
    submission_id, actor_id, actor_role, action_type
  )
  values (
    target_submission_id, auth.uid(), actor_role, 'LOCATION_UPDATED'
  );

  insert into public.workflow_audit_logs (
    submission_id, action_by, action_type, comments
  )
  values (
    target_submission_id,
    auth.uid(),
    'RETRIEVAL_LOCATION_UPDATED',
    'Physical document storage location updated by the assigned office.'
  );
end;
$$;

create or replace function public.release_workflow_document(
  target_submission_id uuid,
  requester_identity_verified boolean
)
returns table (released_at timestamptz, releasing_officer_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  retrieval public.workflow_document_retrievals;
  requester_id uuid;
  released_time timestamptz := now();
begin
  actor_role := public.current_profile_role();
  if auth.uid() is null
    or actor_role is null
    or actor_role not in (
      'tourism_officer',
      'municipal_treasurer',
      'mayor_office',
      'sangguniang_bayan'
    ) then
    raise exception 'Only authorized office staff can release documents';
  end if;
  if requester_identity_verified is distinct from true then
    raise exception 'Verify the requester''s identity and authorization before releasing the document';
  end if;

  select *
  into retrieval
  from public.workflow_document_retrievals
  where submission_id = target_submission_id
  for update;

  if not found
    or retrieval.office_role <> actor_role
    or retrieval.status not in ('active', 'released')
    or retrieval.expires_at <= released_time then
    raise exception 'A valid retrieval record assigned to your office is required';
  end if;

  if retrieval.received_at is null
    or (
      coalesce(nullif(btrim(retrieval.department_section), ''), '')
      || coalesce(nullif(btrim(retrieval.shelf), ''), '')
      || coalesce(nullif(btrim(retrieval.folder_box), ''), '')
    ) = '' then
    raise exception 'Save the physical copy storage location before recording handover';
  end if;

  select submission.user_id
  into requester_id
  from public.workflow_submissions submission
  where submission.id = target_submission_id
    and submission.status in ('completed', 'approved');
  if requester_id is null then
    raise exception 'Only an approved and completed request can be released';
  end if;

  insert into public.workflow_document_retrieval_events (
    submission_id, actor_id, actor_role, action_type, identity_verified
  )
  values (
    target_submission_id, auth.uid(), actor_role, 'DOCUMENT_RELEASED', true
  );

  insert into public.workflow_audit_logs (
    submission_id, action_by, action_type, comments
  )
  values (
    target_submission_id,
    auth.uid(),
    'DOCUMENT_RELEASED',
    'Approved document handed over after in-person identity and authorization verification.'
  );

  insert into public.workflow_notifications (
    recipient_id, submission_id, event_type, title, message
  )
  select
    requester_id,
    target_submission_id,
    'DOCUMENT_RELEASED',
    'Your document has been released',
    coalesce(submission.tracking_number, 'Request')
      || ' - ' || submission.file_name
      || ' was released by ' || coalesce(nullif(btrim(officer.full_name), ''), 'an authorized office staff')
      || ' on ' || to_char(released_time at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') || '.'
  from public.workflow_submissions submission
  left join public.profiles officer on officer.id = auth.uid()
  where submission.id = target_submission_id;

  return query
  select released_time, nullif(btrim(profile.full_name), '')
  from public.profiles profile
  where profile.id = auth.uid();
end;
$$;

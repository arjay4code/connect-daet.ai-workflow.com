with previous_releases as (
  select distinct on (submission_id)
    submission_id,
    actor_id,
    created_at
  from public.workflow_document_retrieval_events
  where action_type = 'DOCUMENT_RELEASED'
  order by submission_id, created_at, id
)
update public.workflow_document_retrievals retrieval
set status = 'released',
    released_at = previous_releases.created_at,
    released_by = previous_releases.actor_id,
    updated_at = greatest(retrieval.updated_at, previous_releases.created_at)
from previous_releases
where retrieval.submission_id = previous_releases.submission_id
  and retrieval.status = 'active'
  and retrieval.released_at is null;

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
    or retrieval.expires_at <= released_time then
    raise exception 'A valid retrieval record assigned to your office is required';
  end if;
  if retrieval.status = 'released' or retrieval.released_at is not null then
    raise exception 'This document has already been handed over';
  end if;
  if retrieval.status <> 'active' then
    raise exception 'A valid retrieval record assigned to your office is required';
  end if;

  if retrieval.received_at is null
    or nullif(btrim(retrieval.department_section), '') is null
    or nullif(btrim(retrieval.shelf), '') is null
    or nullif(btrim(retrieval.folder_box), '') is null then
    raise exception 'Save all three physical storage location fields before recording handover';
  end if;

  select submission.user_id
  into requester_id
  from public.workflow_submissions submission
  where submission.id = target_submission_id
    and submission.status in ('completed', 'approved');
  if requester_id is null then
    raise exception 'Only an approved and completed request can be released';
  end if;

  update public.workflow_document_retrievals
  set status = 'released',
      released_at = released_time,
      released_by = auth.uid(),
      updated_at = released_time
  where submission_id = target_submission_id;

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

revoke all on function public.release_workflow_document(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.release_workflow_document(uuid, boolean)
  to authenticated;

notify pgrst, 'reload schema';

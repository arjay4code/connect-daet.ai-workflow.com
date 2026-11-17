alter table public.workflow_document_retrievals
  drop constraint if exists workflow_document_retrievals_office_role_check;

alter table public.workflow_document_retrievals
  add constraint workflow_document_retrievals_office_role_check
  check (
    office_role in (
      'tourism_officer',
      'municipal_treasurer',
      'mayor_office',
      'sangguniang_bayan'
    )
  );

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
    or actor_role not in (
      'tourism_officer',
      'municipal_treasurer',
      'mayor_office',
      'sangguniang_bayan'
    ) then
    raise exception 'Only authorized office staff can scan document retrieval QR codes';
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
    raise exception 'This request is assigned to a different office';
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
    'Retrieval QR code scanned by the assigned office.'
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

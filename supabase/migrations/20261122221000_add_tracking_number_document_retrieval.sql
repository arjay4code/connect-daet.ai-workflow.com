create or replace function public.get_workflow_retrieval_by_tracking_number(search_tracking_number text)
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
    raise exception 'Only authorized office staff can retrieve document details';
  end if;

  if nullif(btrim(search_tracking_number), '') is null
    or length(btrim(search_tracking_number)) > 80 then
    raise exception 'Enter a valid tracking number';
  end if;

  select retrieval.*
  into target_retrieval
  from public.workflow_document_retrievals retrieval
  join public.workflow_submissions submission
    on submission.id = retrieval.submission_id
  where submission.tracking_number = upper(btrim(search_tracking_number))
    and retrieval.office_role = actor_role
    and retrieval.status in ('active', 'released')
    and retrieval.expires_at > now();

  if not found then
    raise exception 'No active retrieval record with this tracking number is assigned to your office';
  end if;

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

revoke all on function public.get_workflow_retrieval_by_tracking_number(text)
  from public, anon, authenticated;
grant execute on function public.get_workflow_retrieval_by_tracking_number(text)
  to authenticated;

notify pgrst, 'reload schema';

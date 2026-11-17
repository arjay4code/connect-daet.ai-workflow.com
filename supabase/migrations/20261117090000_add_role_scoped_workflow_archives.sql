create or replace function public.get_workflow_archive(
  archive_office_role text default null
)
returns table (
  id uuid,
  tracking_number text,
  file_name text,
  file_type text,
  file_size bigint,
  status text,
  category text,
  other_document_type text,
  created_at timestamptz,
  archive_date timestamptz,
  requester_email text,
  selected_office_role text,
  initial_destination_role text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text := public.current_profile_role();
begin
  if auth.uid() is null or not public.is_active_workflow_account() then
    raise exception 'An active account profile is required';
  end if;

  if actor_role = 'submitter' then
    if archive_office_role is not null then
      raise exception 'Submitters can only view their own archive';
    end if;
  elsif actor_role = 'system_admin' then
    if archive_office_role is not null and archive_office_role not in (
      'tourism_officer',
      'municipal_treasurer',
      'mayor_office',
      'sangguniang_bayan'
    ) then
      raise exception 'The requested office archive is invalid';
    end if;
  elsif actor_role in (
    'tourism_officer',
    'municipal_treasurer',
    'mayor_office',
    'sangguniang_bayan'
  ) then
    if archive_office_role is distinct from actor_role then
      raise exception 'An office can only view its own archive';
    end if;
  else
    raise exception 'This account cannot view workflow archives';
  end if;

  return query
  select
    submission.id,
    submission.tracking_number,
    submission.file_name,
    submission.file_type,
<<<<<<< HEAD
    submission.file_size,
=======
    submission.file_size::bigint,
>>>>>>> f43d4a39e6b0d9fa38d584cc27141cec99e315c4
    submission.status,
    submission.category,
    submission.other_document_type,
    submission.created_at,
    coalesce(
      submission.completed_at,
      submission.final_decided_at,
      submission.approved_at,
      submission.updated_at
    ) as archive_date,
    requester.email as requester_email,
    submission.selected_office_role,
    submission.initial_destination_role
  from public.workflow_submissions submission
  left join public.profiles requester on requester.id = submission.user_id
  where lower(submission.status) in ('approved', 'completed')
    and (
      (actor_role = 'submitter' and submission.user_id = auth.uid())
      or (actor_role = 'system_admin' and archive_office_role is null)
      or (
        archive_office_role is not null
        and (
          submission.selected_office_role = archive_office_role
          or submission.initial_destination_role = archive_office_role
          or exists (
            select 1
            from public.workflow_routing_plans plan
            join public.workflow_routing_steps step
              on step.routing_plan_id = plan.id
            where plan.submission_id = submission.id
              and plan.status in ('finalized', 'superseded')
              and step.status <> 'skipped'
              and (
                step.office_role = archive_office_role
                or step.assigned_by_role = archive_office_role
              )
          )
        )
      )
    )
  order by coalesce(
    submission.completed_at,
    submission.final_decided_at,
    submission.approved_at,
    submission.updated_at
  ) desc, submission.created_at desc;
end;
$$;

revoke all on function public.get_workflow_archive(text) from public, anon;
grant execute on function public.get_workflow_archive(text) to authenticated;

notify pgrst, 'reload schema';

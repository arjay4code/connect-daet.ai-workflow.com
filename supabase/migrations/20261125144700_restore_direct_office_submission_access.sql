create or replace function public.is_submission_assigned_to_current_office(
  target_submission_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_profile_role() in (
    'tourism_officer',
    'municipal_treasurer',
    'mayor_office',
    'sangguniang_bayan'
  )
  and exists (
    select 1
    from public.workflow_submissions submission
    where submission.id = target_submission_id
      and (
        submission.selected_office_role = public.current_profile_role()
        or submission.initial_destination_role = public.current_profile_role()
        or exists (
          select 1
          from public.workflow_routing_plans plan
          join public.workflow_routing_steps step
            on step.routing_plan_id = plan.id
          where plan.submission_id = submission.id
            and plan.status in ('finalized', 'superseded')
            and step.office_role = public.current_profile_role()
            and step.status <> 'skipped'
        )
      )
  )
$$;

revoke all on function public.is_submission_assigned_to_current_office(uuid)
  from public, anon;
grant execute on function public.is_submission_assigned_to_current_office(uuid)
  to authenticated;

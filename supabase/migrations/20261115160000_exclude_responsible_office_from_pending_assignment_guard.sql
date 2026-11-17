create or replace function public.workflow_mvp_has_pending_assignment(
  target_submission_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workflow_routing_plans plan
    join public.workflow_routing_steps step on step.routing_plan_id = plan.id
    join public.workflow_submissions submission on submission.id = plan.submission_id
    where plan.submission_id = target_submission_id
      and plan.is_current
      and plan.status = 'finalized'
      and step.status in ('pending', 'in_progress')
      and step.office_role is distinct from coalesce(
        submission.selected_office_role,
        submission.initial_destination_role
      )
  )
$$;

create or replace function public.return_workflow_submission_to_submitter(
  target_submission_id uuid,
  return_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.workflow_mvp_active_role();
  submission public.workflow_submissions;
  now_at timestamptz := timezone('utc', now());
  reason text := nullif(btrim(return_reason), '');
begin
  if actor_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'An active responsible-office member is required to return this submission';
  end if;
  if reason is null then
    raise exception 'Provide a reason for returning the submission to the submitter';
  end if;

  select *
    into submission
  from public.workflow_submissions
  where id = target_submission_id
  for update;
  if not found
    or submission.selected_office_role is distinct from actor_role
    or submission.status not in ('submitted', 'in_process') then
    raise exception 'Only the responsible office can return a Submitted or In Process submission';
  end if;
  if exists (
    select 1
    from public.workflow_routing_plans plan
    join public.workflow_routing_steps step on step.routing_plan_id = plan.id
    where plan.submission_id = target_submission_id
      and plan.is_current
      and plan.status = 'finalized'
      and step.office_role is distinct from submission.selected_office_role
      and step.status in ('pending', 'in_progress')
  ) then
    raise exception 'Withdraw active forwarded office assignments before returning this submission for redirection';
  end if;

  with withdrawn_assignments as (
    update public.workflow_routing_steps step
    set status = 'withdrawn',
        decided_by = auth.uid(),
        decided_at = now_at,
        comments = 'Automatically withdrawn because the submission was returned: ' || reason
    from public.workflow_routing_plans plan
    where plan.submission_id = target_submission_id
      and plan.id = step.routing_plan_id
      and step.status in ('pending', 'in_progress')
    returning step.office_role
  )
  insert into public.workflow_audit_logs (
    submission_id, action_by, action_type, old_status, new_status, comments, created_at
  )
  select
    target_submission_id, auth.uid(), 'ASSIGNMENT_WITHDRAWN',
    submission.status, 'returned',
    withdrawn_assignments.office_role
      || ': automatically withdrawn because the submission was returned',
    now_at
  from withdrawn_assignments;

  perform set_config('app.workflow_authorized_transition', 'on', true);
  update public.workflow_submissions
  set status = 'returned',
      office_comments = reason,
      updated_at = now_at
  where id = target_submission_id;
  perform set_config('app.workflow_authorized_transition', 'off', true);

  perform public.workflow_mvp_record_history(
    target_submission_id, 'RETURNED_TO_SUBMITTER', submission.status, 'returned',
    reason, now_at
  );

  insert into public.workflow_notifications (
    recipient_id, submission_id, event_type, title, message
  )
  values (
    submission.user_id, target_submission_id, 'RETURNED_TO_SUBMITTER',
    'Your submission was returned for redirection',
    coalesce(submission.tracking_number, 'Pending tracking number')
      || ' — ' || submission.file_name || ': ' || reason
  )
  on conflict (recipient_id, submission_id, event_type, title, message) do nothing;
end;
$$;

create or replace function public.withdraw_workflow_assignment(
  target_submission_id uuid,
  target_assignment_office_role text,
  withdrawal_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.workflow_mvp_active_role();
  submission public.workflow_submissions;
  pending_step public.workflow_routing_steps;
  now_at timestamptz := timezone('utc', now());
  reason text := nullif(btrim(withdrawal_reason), '');
begin
  if actor_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'An active responsible-office member is required to withdraw an assignment';
  end if;
  if reason is null then
    raise exception 'Provide a reason for withdrawing the assignment';
  end if;

  select *
    into submission
  from public.workflow_submissions
  where id = target_submission_id
  for update;
  if not found or submission.selected_office_role is distinct from actor_role then
    raise exception 'Only the responsible office can withdraw an assignment';
  end if;
  if submission.status <> 'in_process' then
    raise exception 'This submission cannot withdraw an assignment in its current status';
  end if;
  if target_assignment_office_role is null
    or target_assignment_office_role = submission.selected_office_role then
    raise exception 'Select the forwarded office assignment to withdraw';
  end if;

  select step.*
    into pending_step
  from public.workflow_routing_plans plan
  join public.workflow_routing_steps step on step.routing_plan_id = plan.id
  where plan.submission_id = target_submission_id
    and plan.is_current
    and plan.status = 'finalized'
    and step.office_role = target_assignment_office_role
    and step.status = 'pending'
  for update of step;
  if not found then
    raise exception 'Only a pending, unreceived office assignment can be withdrawn';
  end if;

  update public.workflow_routing_steps
  set status = 'withdrawn',
      decided_by = auth.uid(),
      decided_at = now_at,
      comments = reason
  where id = pending_step.id;

  perform public.workflow_mvp_record_history(
    target_submission_id, 'ASSIGNMENT_WITHDRAWN', submission.status, submission.status,
    public.workflow_office_label(actor_role) || ' withdrew the assignment with '
      || public.workflow_office_label(target_assignment_office_role), now_at
  );

  insert into public.workflow_notifications (
    recipient_id, submission_id, event_type, title, message
  )
  select
    profile.id,
    target_submission_id,
    'ASSIGNMENT_WITHDRAWN:' || pending_step.id::text,
    public.workflow_office_label(actor_role) || ' withdrew your assignment',
    coalesce(submission.tracking_number, 'Pending tracking number')
      || ' — ' || submission.file_name || E'\n' || reason
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.role = target_assignment_office_role
    and profile.is_active
    and (account.banned_until is null or account.banned_until <= now_at)
  on conflict (recipient_id, submission_id, event_type, title, message) do nothing;
end;
$$;

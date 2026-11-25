select set_config('app.workflow_authorized_transition', 'on', true);

with latest_redirect as (
  select distinct on (log.submission_id)
    log.submission_id,
    log.created_at
  from public.workflow_audit_logs log
  where log.action_type = 'SUBMISSION_REDIRECTED'
  order by log.submission_id, log.created_at desc, log.id desc
),
eligible_submissions as (
  select
    submission.id,
    submission.selected_office_role
  from public.workflow_submissions submission
  join latest_redirect redirected on redirected.submission_id = submission.id
  where submission.status in ('submitted', 'pending_office', 'in_process')
    and submission.selected_office_role in (
      'tourism_officer',
      'municipal_treasurer',
      'mayor_office',
      'sangguniang_bayan'
    )
    and not exists (
      select 1
      from public.workflow_audit_logs later_event
      where later_event.submission_id = submission.id
        and later_event.created_at > redirected.created_at
        and later_event.action_type in (
          'SUBMISSION_FORWARDED',
          'OFFICE_ASSIGNMENT_FORWARDED',
          'OFFICE_ASSIGNMENT_FORWARDED_ONWARD',
          'OFFICE_FORWARDED_TO_TOURISM_OFFICER',
          'ROUTE_PROPOSED',
          'OFFICE_ROUTE_STEP_ASSIGNED',
          'TOURISM_OFFICER_ASSIGNMENTS_CREATED'
        )
    )
)
update public.workflow_submissions submission
set initial_destination_role = eligible.selected_office_role,
    final_decision_office_role = case
      when eligible.selected_office_role = 'tourism_officer' then null
      else eligible.selected_office_role
    end
from eligible_submissions eligible
where submission.id = eligible.id
  and (
    submission.initial_destination_role is distinct from eligible.selected_office_role
    or submission.final_decision_office_role is distinct from case
      when eligible.selected_office_role = 'tourism_officer' then null
      else eligible.selected_office_role
    end
  );

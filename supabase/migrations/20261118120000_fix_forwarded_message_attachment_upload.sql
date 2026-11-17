begin;

create or replace function public.can_upload_workflow_message_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workflow_submissions submission
    where submission.id::text = split_part(object_name, '/', 1)
      and split_part(object_name, '/', 2) = auth.uid()::text
      and (
        (
          cardinality(string_to_array(object_name, '/')) = 4
          and public.can_write_workflow_message_conversation(submission.id, null)
        )
        or exists (
          select 1
          from public.workflow_routing_steps step
          where step.id::text = split_part(object_name, '/', 3)
            and cardinality(string_to_array(object_name, '/')) = 5
            and public.can_write_workflow_message_conversation(submission.id, step.id)
        )
        or (
          cardinality(string_to_array(object_name, '/')) = 5
          and not exists (
            select 1
            from public.workflow_routing_steps step
            where step.id::text = split_part(object_name, '/', 3)
          )
          and exists (
            select 1
            from public.workflow_submissions eligible_submission
            join public.profiles actor on actor.id = auth.uid()
            join auth.users account on account.id = actor.id
            where eligible_submission.id = submission.id
              and eligible_submission.status = 'in_process'
              and actor.is_active
              and (account.banned_until is null or account.banned_until <= timezone('utc', now()))
              and actor.role in (
                'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
              )
              and (
                eligible_submission.selected_office_role = actor.role
                or exists (
                  select 1
                  from public.workflow_routing_plans plan
                  join public.workflow_routing_steps assigned_step
                    on assigned_step.routing_plan_id = plan.id
                  where plan.submission_id = eligible_submission.id
                    and plan.is_current
                    and plan.status = 'finalized'
                    and assigned_step.office_role = actor.role
                    and assigned_step.status in ('pending', 'in_progress')
                )
              )
          )
        )
      )
  )
$$;

revoke all on function public.can_upload_workflow_message_file(text)
  from public, anon;
grant execute on function public.can_upload_workflow_message_file(text)
  to authenticated;

commit;

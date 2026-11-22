with completed_submissions as (
  select
    submission.id,
    coalesce(
      case
        when completing_profile.role in (
          'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
        ) then completing_profile.role
        when completing_profile.role = 'approver' then 'tourism_officer'
      end,
      case
        when submission.final_decision_office_role in (
          'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
        ) then submission.final_decision_office_role
        when submission.final_decision_office_role = 'approver' then 'tourism_officer'
      end,
      case
        when submission.initial_destination_role in (
          'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
        ) then submission.initial_destination_role
        when submission.initial_destination_role = 'approver' then 'tourism_officer'
      end
    ) as office_role
  from public.workflow_submissions submission
  left join public.profiles completing_profile
    on completing_profile.id = coalesce(submission.final_decision_by, submission.closed_by)
  where submission.status in ('completed', 'approved')
)
update public.workflow_document_retrievals retrieval
set office_role = completed_submissions.office_role,
    updated_at = now()
from completed_submissions
where retrieval.submission_id = completed_submissions.id
  and retrieval.status = 'active'
  and completed_submissions.office_role is not null
  and retrieval.office_role is distinct from completed_submissions.office_role;

create or replace function public.create_workflow_retrieval_qr(target_submission_id uuid)
returns table (retrieval_token uuid, expires_at timestamptz, retrieval_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_office_role text;
  retrieval public.workflow_document_retrievals;
  token_created boolean := false;
  inserted_rows integer;
begin
  if auth.uid() is null
    or coalesce(public.current_profile_role(), '') <> 'submitter'
    or not exists (
      select 1
      from public.workflow_submissions submission
      where submission.id = target_submission_id
        and submission.user_id = auth.uid()
        and submission.status in ('completed', 'approved')
    ) then
    raise exception 'An eligible request belonging to the signed-in user is required';
  end if;

  select coalesce(
    case
      when completing_profile.role in (
        'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
      ) then completing_profile.role
      when completing_profile.role = 'approver' then 'tourism_officer'
    end,
    case
      when submission.final_decision_office_role in (
        'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
      ) then submission.final_decision_office_role
      when submission.final_decision_office_role = 'approver' then 'tourism_officer'
    end,
    case
      when submission.initial_destination_role in (
        'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
      ) then submission.initial_destination_role
      when submission.initial_destination_role = 'approver' then 'tourism_officer'
    end
  )
  into target_office_role
  from public.workflow_submissions submission
  left join public.profiles completing_profile
    on completing_profile.id = coalesce(submission.final_decision_by, submission.closed_by)
  where submission.id = target_submission_id
    and submission.user_id = auth.uid()
    and submission.status in ('completed', 'approved');

  if target_office_role is null then
    raise exception 'The office that completed this request could not be determined';
  end if;

  insert into public.workflow_document_retrievals (submission_id, office_role)
  values (target_submission_id, target_office_role)
  on conflict (submission_id) do nothing;
  get diagnostics inserted_rows = row_count;
  token_created := inserted_rows > 0;

  select *
  into retrieval
  from public.workflow_document_retrievals
  where submission_id = target_submission_id
  for update;

  if retrieval.status = 'released' then
    raise exception 'This document has already been released';
  end if;

  if retrieval.status = 'revoked' or retrieval.expires_at <= now() then
    update public.workflow_document_retrievals
    set qr_token = gen_random_uuid(),
        office_role = target_office_role,
        status = 'active',
        generated_at = now(),
        expires_at = now() + interval '1 year',
        updated_at = now()
    where submission_id = target_submission_id
    returning * into retrieval;
    token_created := true;
  elsif retrieval.office_role is distinct from target_office_role then
    update public.workflow_document_retrievals
    set office_role = target_office_role,
        updated_at = now()
    where submission_id = target_submission_id
    returning * into retrieval;
  end if;

  if token_created then
    insert into public.workflow_document_retrieval_events (
      submission_id, actor_id, actor_role, action_type
    )
    values (
      target_submission_id, auth.uid(), public.current_profile_role(), 'QR_GENERATED'
    );
  end if;

  return query
  select retrieval.qr_token, retrieval.expires_at, retrieval.status;
end;
$$;

revoke all on function public.create_workflow_retrieval_qr(uuid)
  from public, anon, authenticated;
grant execute on function public.create_workflow_retrieval_qr(uuid)
  to authenticated;

notify pgrst, 'reload schema';

create or replace function public.set_workflow_submission_archive(
  target_submission_id uuid,
  should_archive boolean,
  retention_date timestamptz default null
)
returns public.workflow_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  result public.workflow_submissions;
begin
  select role into actor_role
  from public.profiles
  where id = auth.uid();

  if actor_role is distinct from 'system_admin' then
    raise exception 'Only an administrator can change archive status';
  end if;

  select * into result
  from public.workflow_submissions
  where id = target_submission_id
  for update;

  if not found then
    raise exception 'Workflow submission does not exist';
  end if;

  if should_archive
    and lower(coalesce(result.status, '')) not in ('approved', 'completed') then
    raise exception 'Only approved or completed submissions can be archived';
  end if;

  update public.workflow_submissions
  set archived_at = case
        when should_archive then coalesce(archived_at, timezone('utc', now()))
        else null
      end,
      archived_by = case when should_archive then auth.uid() else null end,
      retention_until = case when should_archive then retention_date else null end
  where id = target_submission_id
  returning * into result;

  insert into public.workflow_audit_logs (
    submission_id, action_by, action_type, comments
  )
  values (
    result.id,
    auth.uid(),
    case when should_archive then 'ARCHIVED' else 'UNARCHIVED' end,
    case when should_archive
      then 'Retention until ' || coalesce(retention_date::text, 'not specified')
      else 'Archive access restored'
    end
  );

  return result;
end;
$$;

grant execute on function public.set_workflow_submission_archive(uuid, boolean, timestamptz)
  to authenticated;

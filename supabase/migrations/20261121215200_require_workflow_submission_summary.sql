create or replace function public.require_workflow_submission_summary()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(length(btrim(new.description)), 0) = 0 then
    raise exception 'A brief request summary is required';
  end if;

  return new;
end;
$$;

drop trigger if exists workflow_submissions_require_summary
  on public.workflow_submissions;

create trigger workflow_submissions_require_summary
before insert on public.workflow_submissions
for each row
execute function public.require_workflow_submission_summary();

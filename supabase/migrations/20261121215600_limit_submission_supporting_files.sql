create or replace function public.enforce_submission_supporting_file_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_file_count integer;
begin
  perform 1
  from public.workflow_submissions
  where id = new.submission_id
  for update;

  select count(*)
  into existing_file_count
  from public.workflow_submission_attachments
  where submission_id = new.submission_id;

  if existing_file_count >= 15 then
    raise exception 'A submission can have no more than 15 supporting files';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_submission_supporting_file_limit() from public, anon, authenticated;

drop trigger if exists workflow_submission_supporting_file_limit
  on public.workflow_submission_attachments;

create trigger workflow_submission_supporting_file_limit
before insert on public.workflow_submission_attachments
for each row
execute function public.enforce_submission_supporting_file_limit();

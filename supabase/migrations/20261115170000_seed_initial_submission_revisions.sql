begin;

create or replace function public.workflow_mvp_seed_initial_submission_revision(
  target_submission_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  submission public.workflow_submissions;
  new_revision_id uuid;
begin
  select *
    into submission
  from public.workflow_submissions
  where id = target_submission_id
  for update;

  if not found or submission.current_revision_id is not null then
    return;
  end if;

  select revision.id
    into new_revision_id
  from public.workflow_submission_revisions revision
  where revision.submission_id = target_submission_id
  order by revision.revision_no desc
  limit 1;

  if new_revision_id is null then
    insert into public.workflow_submission_revisions (
      submission_id, revision_no, created_by, created_at, form_snapshot,
      backfill_quality
    )
    values (
      submission.id,
      1,
      submission.user_id,
      submission.created_at,
      jsonb_build_object(
        'title', submission.file_name,
        'category', submission.category,
        'other_document_type', submission.other_document_type,
        'description', submission.description,
        'purpose', submission.purpose,
        'requested_action', submission.requested_action,
        'intended_recipient', submission.intended_recipient,
        'initial_destination_role', submission.initial_destination_role,
        'selected_office_role', submission.selected_office_role
      ),
      'complete'
    )
    returning id into new_revision_id;

    if submission.file_name is not null and submission.file_path is not null then
      insert into public.workflow_revision_files (
        revision_id, logical_file_id, file_role, file_name, storage_path,
        file_type, file_size, change_kind, uploaded_by, created_at
      )
      values (
        new_revision_id,
        md5(submission.id::text || ':logical-primary')::uuid,
        'primary',
        submission.file_name,
        submission.file_path,
        submission.file_type,
        coalesce(submission.file_size, 0),
        'added',
        submission.user_id,
        submission.created_at
      )
      on conflict (revision_id, logical_file_id) do nothing;

    end if;

    insert into public.workflow_revision_files (
      revision_id, logical_file_id, file_role, file_name, storage_path,
      file_type, file_size, change_kind, uploaded_by, created_at
    )
    select
      new_revision_id,
      attachment.id,
      'supporting',
      attachment.file_name,
      attachment.file_path,
      attachment.file_type,
      attachment.file_size,
      'added',
      attachment.uploaded_by,
      attachment.created_at
    from public.workflow_submission_attachments attachment
    where attachment.submission_id = submission.id
    on conflict (revision_id, logical_file_id) do nothing;
  end if;

  perform set_config('app.workflow_authorized_revision_transition', 'on', true);
  update public.workflow_submissions
  set current_revision_id = new_revision_id
  where id = submission.id;
  perform set_config('app.workflow_authorized_revision_transition', 'off', true);
end;
$$;

create or replace function public.workflow_mvp_seed_initial_submission_revision_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.workflow_mvp_seed_initial_submission_revision(new.id);
  return new;
end;
$$;

drop trigger if exists workflow_submissions_seed_initial_revision
  on public.workflow_submissions;
create trigger workflow_submissions_seed_initial_revision
after insert on public.workflow_submissions
for each row
execute function public.workflow_mvp_seed_initial_submission_revision_trigger();

create or replace function public.workflow_mvp_add_initial_supporting_revision_file()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  submission public.workflow_submissions;
  revision_number integer;
begin
  select *
    into submission
  from public.workflow_submissions
  where id = new.submission_id;

  if not found
    or submission.current_revision_id is null
    or submission.status not in ('submitted', 'pending', 'pending_office') then
    return new;
  end if;

  select revision.revision_no
    into revision_number
  from public.workflow_submission_revisions revision
  where revision.id = submission.current_revision_id;

  if revision_number <> 1 then
    return new;
  end if;

  insert into public.workflow_revision_files (
    revision_id, logical_file_id, file_role, file_name, storage_path,
    file_type, file_size, change_kind, uploaded_by, created_at
  )
  values (
    submission.current_revision_id,
    new.id,
    'supporting',
    new.file_name,
    new.file_path,
    new.file_type,
    new.file_size,
    'added',
    new.uploaded_by,
    new.created_at
  )
  on conflict (revision_id, logical_file_id) do nothing;

  return new;
end;
$$;

drop trigger if exists workflow_submission_attachments_add_initial_revision_file
  on public.workflow_submission_attachments;
create trigger workflow_submission_attachments_add_initial_revision_file
after insert on public.workflow_submission_attachments
for each row
execute function public.workflow_mvp_add_initial_supporting_revision_file();

revoke all on function public.workflow_mvp_seed_initial_submission_revision(uuid)
  from public, anon, authenticated;

do $$
declare
  submission_id uuid;
begin
  for submission_id in
    select submission.id
    from public.workflow_submissions submission
    where submission.current_revision_id is null
    order by submission.created_at, submission.id
  loop
    perform public.workflow_mvp_seed_initial_submission_revision(submission_id);
  end loop;
end;
$$;

commit;

create or replace function public.update_workflow_document_location(
  target_submission_id uuid,
  location_department_section text,
  location_room text,
  location_cabinet text,
  location_shelf text,
  location_drawer text,
  location_folder_box text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  retrieval public.workflow_document_retrievals;
begin
  actor_role := public.current_profile_role();
  if auth.uid() is null
    or actor_role is null
    or actor_role not in (
      'tourism_officer',
      'municipal_treasurer',
      'mayor_office',
      'sangguniang_bayan'
    ) then
    raise exception 'Only authorized office staff can update document storage locations';
  end if;

  if nullif(btrim(location_department_section), '') is null
    or nullif(btrim(location_shelf), '') is null
    or nullif(btrim(location_folder_box), '') is null then
    raise exception 'Department / room, shelf, and folder / box are required';
  end if;

  if exists (
    select 1
    from unnest(array[
      location_department_section, location_shelf, location_folder_box
    ]) as locations(value)
    where length(coalesce(value, '')) > 200
  ) then
    raise exception 'Each storage location field must be 200 characters or fewer';
  end if;

  select *
  into retrieval
  from public.workflow_document_retrievals
  where submission_id = target_submission_id
  for update;

  if not found
    or retrieval.office_role <> actor_role
    or retrieval.status not in ('active', 'released')
    or retrieval.expires_at <= now() then
    raise exception 'A valid retrieval record assigned to your office is required';
  end if;

  update public.workflow_document_retrievals
  set department_section = nullif(btrim(location_department_section), ''),
      room = null,
      cabinet = null,
      shelf = nullif(btrim(location_shelf), ''),
      drawer = null,
      folder_box = nullif(btrim(location_folder_box), ''),
      received_at = coalesce(received_at, now()),
      location_updated_at = now(),
      location_updated_by = auth.uid(),
      updated_at = now()
  where submission_id = target_submission_id;

  insert into public.workflow_document_retrieval_events (
    submission_id, actor_id, actor_role, action_type
  )
  values (
    target_submission_id, auth.uid(), actor_role, 'LOCATION_UPDATED'
  );

  insert into public.workflow_audit_logs (
    submission_id, action_by, action_type, comments
  )
  values (
    target_submission_id,
    auth.uid(),
    'RETRIEVAL_LOCATION_UPDATED',
    'Physical document storage location updated by the assigned office.'
  );
end;
$$;

revoke all on function public.update_workflow_document_location(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_workflow_document_location(uuid, text, text, text, text, text, text)
  to authenticated;

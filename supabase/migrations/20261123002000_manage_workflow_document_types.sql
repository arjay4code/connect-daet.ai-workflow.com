create or replace function public.add_workflow_office_document_type(
  target_office_role text,
  target_document_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_document_type text := nullif(btrim(target_document_type), '');
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'system_admin' then
    raise exception 'Only an authenticated system administrator can manage office document types';
  end if;
  if target_office_role is null or target_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'Select a supported office';
  end if;
  if normalized_document_type is null then
    raise exception 'Enter a document type';
  end if;
  if length(normalized_document_type) > 120 then
    raise exception 'Document types must be no more than 120 characters';
  end if;
  if lower(normalized_document_type) = 'other' then
    raise exception 'Other is a protected document type';
  end if;
  if exists (
    select 1
    from public.workflow_office_document_types document_type
    where document_type.office_role = target_office_role
      and lower(document_type.document_type) = lower(normalized_document_type)
  ) then
    raise exception 'That document type already exists for the selected office';
  end if;

  insert into public.workflow_office_document_types (office_role, document_type)
  values (target_office_role, normalized_document_type);
exception
  when unique_violation then
    raise exception 'That document type already exists for the selected office';
end;
$$;

create or replace function public.delete_workflow_office_document_type(
  target_office_role text,
  target_document_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_document_type text := nullif(btrim(target_document_type), '');
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'system_admin' then
    raise exception 'Only an authenticated system administrator can manage office document types';
  end if;
  if target_office_role is null or target_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'Select a supported office';
  end if;
  if normalized_document_type is null then
    raise exception 'Select a document type';
  end if;
  if lower(normalized_document_type) = 'other' then
    raise exception 'Other is a protected document type';
  end if;
  if exists (
    select 1
    from public.workflow_final_decision_authorities authority
    where authority.office_role = target_office_role
      and authority.document_type = normalized_document_type
  ) then
    raise exception 'Remove or update the document-specific final-decision authority before deleting this type';
  end if;
  if exists (
    select 1
    from public.workflow_submissions submission
    where submission.category = normalized_document_type
      and (
        submission.initial_destination_role = target_office_role
        or submission.selected_office_role = target_office_role
        or submission.final_decision_office_role = target_office_role
      )
      and lower(submission.status) not in (
        'approved',
        'completed',
        'declined_by_approver',
        'declined_by_admin',
        'declined_by_mayor',
        'declined_by_office',
        'rejected',
        'withdrawn',
        'closed_by_submitter',
        'abandoned'
      )
  ) then
    raise exception 'This type is used by an open submission; finish or redirect that submission before deleting it';
  end if;

  delete from public.workflow_office_document_types document_type
  where document_type.office_role = target_office_role
    and document_type.document_type = normalized_document_type;
  if not found then
    raise exception 'Document type not found for the selected office';
  end if;
end;
$$;

revoke all on function public.add_workflow_office_document_type(text, text)
  from public, anon, authenticated;
revoke all on function public.delete_workflow_office_document_type(text, text)
  from public, anon, authenticated;
grant execute on function public.add_workflow_office_document_type(text, text)
  to authenticated;
grant execute on function public.delete_workflow_office_document_type(text, text)
  to authenticated;

notify pgrst, 'reload schema';

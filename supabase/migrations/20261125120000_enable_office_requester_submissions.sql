begin;

do $migration$
declare
  function_definition text;
  original_definition text;
  old_fragment text;
  new_fragment text;
begin
  select pg_get_functiondef(
    'public.create_workflow_submission(text,text,text,text,bigint,text,text,text,text,text,text,jsonb,text)'::regprocedure
  ) into function_definition;
  original_definition := function_definition;

  old_fragment := $old$actor_role is distinct from 'submitter'$old$;
  new_fragment := $new$actor_role not in (
    'submitter', 'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  )$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'Could not safely authorize office request creation';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);
  function_definition := replace(
    function_definition,
    'Only a submitter can create a workflow submission',
    'Only an active submitter or workflow office can create a request'
  );
  function_definition := replace(
    function_definition,
    'Only a requestee can create a workflow submission',
    'Only an active submitter or workflow office can create a request'
  );

  old_fragment := $old$if submission_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'Select a valid destination office';
  end if;$old$;
  new_fragment := $new$if submission_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) or (actor_role <> 'submitter' and submission_office_role = actor_role) then
    raise exception 'Select a valid destination office other than your own';
  end if;$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'Could not safely prevent office requests from routing to their own office';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);

  old_fragment := $old$'Initial destination selected by requestee: '$old$;
  if position(old_fragment in function_definition) = 0 then
    old_fragment := $old$'Initial destination selected by submitter: '$old$;
  end if;
  new_fragment := $new$case
      when actor_role = 'submitter' then 'Initial destination selected by requestee: '
      else 'Initial destination selected by originating office (' || actor_role || '): '
    end$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'Could not safely update the request creation history wording';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);

  if function_definition = original_definition then
    raise exception 'Office request creation function was not updated';
  end if;
  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
  old_fragment text;
  new_fragment text;
begin
  select pg_get_functiondef(
    'public.redirect_workflow_submission(uuid,text,text,text)'::regprocedure
  ) into function_definition;
  original_definition := function_definition;

  old_fragment := $old$if target_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) then
    raise exception 'Select a permitted destination office';
  end if;$old$;
  new_fragment := $new$if target_office_role not in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) or (actor_role <> 'submitter' and target_office_role = actor_role) then
    raise exception 'Select a permitted destination office other than your own';
  end if;$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'Could not safely prevent redirecting an office request to its own office';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);
  if function_definition = original_definition then
    raise exception 'Office request redirect destination was not updated';
  end if;
  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_oid oid;
  original_source text;
  updated_source text;
  function_definition text;
  source_position integer;
begin
  for function_oid in
    select unnest(array[
      'public.get_workflow_retrieval_qr(uuid)'::regprocedure::oid,
      'public.create_workflow_retrieval_qr(uuid)'::regprocedure::oid
    ])
  loop
    select procedure.prosrc
    into original_source
    from pg_proc procedure
    where procedure.oid = function_oid;

    updated_source := replace(
      original_source,
      $old$coalesce(public.current_profile_role(), '') <> 'submitter'$old$,
      $new$coalesce(public.current_profile_role(), '') not in (
        'submitter', 'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
      )$new$
    );

    if updated_source = original_source then
      if position(
        $new$coalesce(public.current_profile_role(), '') not in (
          'submitter', 'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
        )$new$
        in original_source
      ) = 0 then
        raise exception 'Could not safely update requester retrieval access for %', function_oid::regprocedure;
      end if;
      continue;
    end if;
    if position('and submission.user_id = auth.uid()' in original_source) = 0 then
      raise exception 'Requester ownership check is missing from %', function_oid::regprocedure;
    end if;

    select pg_get_functiondef(function_oid)
    into function_definition
    from pg_proc procedure
    where procedure.oid = function_oid;
    source_position := strpos(function_definition, original_source);
    if source_position = 0 then
      raise exception 'Could not safely rebuild requester retrieval function %', function_oid::regprocedure;
    end if;

    function_definition := overlay(
      function_definition
      placing updated_source
      from source_position
      for char_length(original_source)
    );
    execute function_definition;
  end loop;
end;
$migration$;

do $migration$
declare
  target_signature regprocedure;
  function_definition text;
  original_definition text;
  old_fragment text := $old$actor_role is distinct from 'submitter'$old$;
  new_fragment text := $new$actor_role not in (
    'submitter', 'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  )$new$;
begin
  for target_signature in
    select unnest(array[
      'public.submit_workflow_submission_revision(uuid,uuid,uuid,text,jsonb)'::regprocedure,
      'public.close_workflow_submission_permanently(uuid,uuid)'::regprocedure,
      'public.redirect_workflow_submission(uuid,text,text,text)'::regprocedure,
      'public.withdraw_workflow_submission(uuid,text)'::regprocedure
    ])
  loop
    select pg_get_functiondef(target_signature::oid) into function_definition;
    original_definition := function_definition;

    if position(old_fragment in function_definition) = 0 then
      raise exception 'Could not safely update requester permissions for %', target_signature;
    end if;
    if position('and user_id = auth.uid()' in function_definition) = 0 then
      raise exception 'Requester ownership check is missing from %', target_signature;
    end if;

    function_definition := replace(function_definition, old_fragment, new_fragment);
    if function_definition = original_definition then
      raise exception 'Requester permissions were not updated for %', target_signature;
    end if;
    execute function_definition;
  end loop;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
  old_fragment text;
  new_fragment text;
begin
  select pg_get_functiondef(
    'public.workflow_mvp_close_submission_internal(uuid,text,text,text,text,bigint)'::regprocedure
  ) into function_definition;
  original_definition := function_definition;

  old_fragment := $old$where submission.selected_office_role = actor_role$old$;
  new_fragment := $new$where submission.selected_office_role = actor_role
    and exists (
      select 1
      from public.profiles requester
      where requester.id = submission.user_id
        and requester.role = 'submitter'
    )$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'Could not safely keep office-requester accounts out of the reward ledger';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);
  if function_definition = original_definition then
    raise exception 'Office requester reward eligibility was not updated';
  end if;
  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
  old_fragment text;
  new_fragment text;
begin
  select pg_get_functiondef(
    'public.queue_workflow_notification_email()'::regprocedure
  ) into function_definition;
  original_definition := function_definition;

  old_fragment := $old$action_path := case recipient_role
    when 'submitter' then '/workflow/user/file_registry/' || new.submission_id::text
    when 'system_admin' then '/workflow/admin/submissions/' || new.submission_id::text
    when 'tourism_officer' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'municipal_treasurer' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'mayor_office' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'sangguniang_bayan' then '/workflow/reviewer/file_management/' || new.submission_id::text
    when 'user' then '/workflow/user/file_registry/' || new.submission_id::text
    when 'admin' then '/workflow/admin/submissions/' || new.submission_id::text
    when 'approver' then '/workflow/reviewer/file_management/' || new.submission_id::text
    else '/workflow'
  end;$old$;
  new_fragment := $new$action_path := case
    when new.recipient_id = submission_user_id then
      '/workflow/user/file_registry/' || new.submission_id::text
    else case recipient_role
      when 'submitter' then '/workflow/user/file_registry/' || new.submission_id::text
      when 'system_admin' then '/workflow/admin/submissions/' || new.submission_id::text
      when 'tourism_officer' then '/workflow/reviewer/file_management/' || new.submission_id::text
      when 'municipal_treasurer' then '/workflow/reviewer/file_management/' || new.submission_id::text
      when 'mayor_office' then '/workflow/reviewer/file_management/' || new.submission_id::text
      when 'sangguniang_bayan' then '/workflow/reviewer/file_management/' || new.submission_id::text
      when 'user' then '/workflow/user/file_registry/' || new.submission_id::text
      when 'admin' then '/workflow/admin/submissions/' || new.submission_id::text
      when 'approver' then '/workflow/reviewer/file_management/' || new.submission_id::text
      else '/workflow'
    end
  end;$new$;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'Could not safely route requester emails to requester tracking details';
  end if;
  function_definition := replace(function_definition, old_fragment, new_fragment);
  if function_definition = original_definition then
    raise exception 'Requester email routing was not updated';
  end if;
  execute function_definition;
end;
$migration$;

do $migration$
declare
  function_definition text;
  original_definition text;
begin
  select pg_get_functiondef(
    'public.forward_workflow_submission_to_office(uuid,text,uuid,uuid,text,jsonb,text,text)'::regprocedure
  ) into function_definition;
  function_definition := replace(function_definition, E'\r\n', E'\n');
  original_definition := function_definition;

  function_definition := replace(
    function_definition,
    $old$' — Inter-office request: '$old$,
    $new$' — Recommendation: '$new$
  );
  function_definition := replace(
    function_definition,
    $old$' — Inter-office request'$old$,
    $new$' — Recommendation'$new$
  );
  function_definition := replace(
    function_definition,
    $old$' sent an inter-office request to '$old$,
    $new$' asked '$new$
  );
  function_definition := replace(
    function_definition,
    $old$public.workflow_office_label(target_office_role) || ''$old$,
    $new$public.workflow_office_label(target_office_role) || ' for a recommendation'$new$
  );
  function_definition := replace(
    function_definition,
    $old$target_office_role || ''$old$,
    $new$target_office_role || ' for a recommendation'$new$
  );
  function_definition := replace(
    function_definition,
    $old$'Inter-office request received'$old$,
    $new$'Document forwarded for Recommendation'$new$
  );
  function_definition := replace(
    function_definition,
    $old$' sent your office an inter-office request'$old$,
    $new$' requested your office''s recommendation'$new$
  );

  if function_definition ilike '%inter-office request%' then
    raise exception 'Office forwarding still contains inter-office request wording';
  end if;
  if position($baseline$' — Recommendation'$baseline$ in function_definition) = 0
    and position($baseline$' — Recommendation:'$baseline$ in function_definition) = 0
    and position($baseline$' for a recommendation'$baseline$ in function_definition) = 0
    and position($baseline$' asked '$baseline$ in function_definition) = 0 then
    raise exception 'Could not verify the restored office recommendation history wording';
  end if;
  if position($baseline$'Document forwarded for Recommendation'$baseline$ in function_definition) = 0
    and position($baseline$' requested your office''s recommendation'$baseline$ in function_definition) = 0
    and position($baseline$' forward an inter-office request'$baseline$ in function_definition) = 0
    and position($baseline$' recommendation'$baseline$ in lower(function_definition)) = 0 then
    raise exception 'Could not verify the restored office recommendation notification wording';
  end if;
  if function_definition is distinct from original_definition then
    execute function_definition;
  end if;
end;GitHub Copilot: Sign Out
$migration$;

commit;

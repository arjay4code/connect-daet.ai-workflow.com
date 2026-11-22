do $$
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
      $legacy$coalesce(public.current_profile_role(), '') <> 'user'$legacy$,
      $submitter$coalesce(public.current_profile_role(), '') <> 'submitter'$submitter$
    );

    if function_oid = 'public.create_workflow_retrieval_qr(uuid)'::regprocedure::oid then
      updated_source := replace(
        updated_source,
        $legacy_event$target_submission_id, auth.uid(), 'user', 'QR_GENERATED'$legacy_event$,
        $current_role_event$target_submission_id, auth.uid(), public.current_profile_role(), 'QR_GENERATED'$current_role_event$
      );
      updated_source := replace(
        updated_source,
        $renamed_event$target_submission_id, auth.uid(), 'submitter', 'QR_GENERATED'$renamed_event$,
        $current_role_event$target_submission_id, auth.uid(), public.current_profile_role(), 'QR_GENERATED'$current_role_event$
      );
    end if;

    if updated_source = original_source then
      if position(
        $submitter$coalesce(public.current_profile_role(), '') <> 'submitter'$submitter$
        in original_source
      ) = 0 then
        raise exception 'Could not safely update the retrieval QR role check';
      end if;
      continue;
    end if;

    select pg_get_functiondef(function_oid)
    into function_definition;
    source_position := strpos(function_definition, original_source);
    if source_position = 0 then
      raise exception 'Could not safely rebuild a retrieval QR function';
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
$$;

notify pgrst, 'reload schema';

do $migration$
declare
  function_definition text;
  original_definition text;
  old_fragment text;
  new_fragment text;
begin
  select pg_get_functiondef(
    'public.forward_workflow_submission_to_office(uuid,text,uuid,uuid,text,jsonb,text,text)'::regprocedure
  ) into function_definition;
  function_definition := replace(function_definition, E'\r\n', E'\n');
  original_definition := function_definition;

  old_fragment := $old$' — Recommendation'$old$;
  new_fragment := $new$' — Inter-office request'$new$;
  if position(old_fragment in function_definition) > 0 then
    function_definition := replace(function_definition, old_fragment, new_fragment);
  elsif position($old$' asked '$old$ in function_definition) > 0
    and position($old$' for a recommendation'$old$ in function_definition) > 0 then
    function_definition := replace(
      function_definition,
      $old$' asked '$old$,
      $new$' sent an inter-office request to '$new$
    );
    function_definition := replace(
      function_definition,
      $old$' for a recommendation'$old$,
      $new$''$new$
    );
  elsif position($check$' — Inter-office request'$check$ in function_definition) = 0
    and position($check$' sent an inter-office request to '$check$ in function_definition) = 0 then
    raise exception 'Could not safely update inter-office request history wording';
  end if;

  old_fragment := $old$'Document forwarded for Recommendation'$old$;
  new_fragment := $new$'Inter-office request received'$new$;
  if position(old_fragment in function_definition) > 0 then
    function_definition := replace(function_definition, old_fragment, new_fragment);
  elsif position($old$' requested your office''s recommendation'$old$ in function_definition) > 0 then
    function_definition := replace(
      function_definition,
      $old$' requested your office''s recommendation'$old$,
      $new$' sent your office an inter-office request'$new$
    );
  elsif position(new_fragment in function_definition) = 0
    and position($check$' sent your office an inter-office request'$check$ in function_definition) = 0 then
    raise exception 'Could not safely update inter-office request notification wording';
  end if;

  if position($check$' — Inter-office request'$check$ in function_definition) = 0
    and position($check$' sent an inter-office request to '$check$ in function_definition) = 0 then
    raise exception 'Inter-office request history wording was not updated';
  end if;
  if position($check$'Inter-office request received'$check$ in function_definition) = 0
    and position($check$' sent your office an inter-office request'$check$ in function_definition) = 0 then
    raise exception 'Inter-office request notification wording was not updated';
  end if;
  if function_definition is distinct from original_definition then
    execute function_definition;
  end if;
end;
$migration$;

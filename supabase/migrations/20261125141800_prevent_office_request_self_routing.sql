begin;

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

  if position('requester_role text;' in function_definition) = 0 then
    old_fragment := $old$actor_role text := public.workflow_mvp_active_role();$old$;
    new_fragment := $new$actor_role text := public.workflow_mvp_active_role();
  requester_role text;$new$;
    if position(old_fragment in function_definition) = 0 then
      raise exception 'Could not safely add the originating office role to forwarding';
    end if;
    function_definition := replace(function_definition, old_fragment, new_fragment);
  end if;

  if position('target_office_role = requester_role' in function_definition) = 0 then
    old_fragment := $old$select * into current_plan$old$;
    new_fragment := $new$select profile.role
    into requester_role
  from public.profiles profile
  where profile.id = submission.user_id;

  if requester_role in (
    'tourism_officer', 'municipal_treasurer', 'mayor_office', 'sangguniang_bayan'
  ) and target_office_role = requester_role then
    raise exception 'The originating office cannot receive its own forwarded request';
  end if;

  select * into current_plan$new$;
    if position(old_fragment in function_definition) = 0 then
      raise exception 'Could not safely prevent forwarding to the originating office';
    end if;
    function_definition := replace(function_definition, old_fragment, new_fragment);
  end if;

  if position('requester_role text;' in function_definition) = 0
    or position('target_office_role = requester_role' in function_definition) = 0 then
    raise exception 'Forwarding to the originating office is not blocked';
  end if;
  if function_definition is distinct from original_definition then
    execute function_definition;
  end if;
end;
$migration$;

commit;

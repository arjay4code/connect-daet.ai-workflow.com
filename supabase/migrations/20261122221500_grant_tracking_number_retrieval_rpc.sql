revoke all on function public.get_workflow_retrieval_by_tracking_number(text) from public, anon;
grant execute on function public.get_workflow_retrieval_by_tracking_number(text)
  to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.get_workflow_retrieval_by_tracking_number(text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated users cannot execute the tracking-number retrieval function';
  end if;
end;
$$;

notify pgrst, 'reload schema';

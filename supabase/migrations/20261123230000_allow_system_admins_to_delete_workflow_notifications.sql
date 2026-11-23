drop policy if exists "System admins can delete all workflow notifications"
  on public.workflow_notifications;

create policy "System admins can delete all workflow notifications"
  on public.workflow_notifications
  for delete
  to authenticated
  using (public.is_workflow_admin());

grant delete on public.workflow_notifications to authenticated;

notify pgrst, 'reload schema';

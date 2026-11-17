drop policy if exists "Users can delete their own workflow notifications"
  on public.workflow_notifications;
drop policy if exists "Users can delete archived workflow notifications"
  on public.workflow_notifications;

create policy "Users can delete their own workflow notifications"
  on public.workflow_notifications
  for delete
  to authenticated
  using (recipient_id = auth.uid());

grant delete on public.workflow_notifications to authenticated;

create or replace function public.has_unread_workflow_notifications()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workflow_notifications notification
    where notification.recipient_id = auth.uid()
      and notification.read_at is null
  );
$$;

revoke all on function public.has_unread_workflow_notifications() from public, anon;
grant execute on function public.has_unread_workflow_notifications() to authenticated;

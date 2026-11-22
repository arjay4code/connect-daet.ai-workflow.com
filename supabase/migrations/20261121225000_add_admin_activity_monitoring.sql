alter table public.profiles
  add column if not exists is_removed boolean not null default false;

update public.profiles
set is_removed = true
where is_active = false
  and email like 'removed+%@account.invalid';

create table if not exists public.workflow_user_presence_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists workflow_user_presence_sessions_user_seen_idx
  on public.workflow_user_presence_sessions (user_id, last_seen_at desc);

create table if not exists public.system_activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null,
  event_type text not null,
  submission_id uuid references public.workflow_submissions(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_activity_events_created_at_idx
  on public.system_activity_events (created_at desc);

create index if not exists system_activity_events_actor_created_at_idx
  on public.system_activity_events (actor_id, created_at desc);

create unique index if not exists system_activity_events_workflow_audit_id_idx
  on public.system_activity_events ((details->>'workflow_audit_log_id'))
  where event_type = 'WORKFLOW_ACTION'
    and details ? 'workflow_audit_log_id';

alter table public.workflow_user_presence_sessions enable row level security;
alter table public.system_activity_events enable row level security;

revoke all on table public.workflow_user_presence_sessions from public, anon, authenticated;
revoke all on table public.system_activity_events from public, anon, authenticated;
grant all on table public.workflow_user_presence_sessions to service_role;
grant all on table public.system_activity_events to service_role;

create or replace function public.record_system_workflow_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role_value text;
begin
  select profile.role
  into actor_role_value
  from public.profiles profile
  where profile.id = new.action_by;

  insert into public.system_activity_events (
    actor_id, actor_role, event_type, submission_id, details, created_at
  )
  values (
    new.action_by,
    coalesce(actor_role_value, 'system'),
    'WORKFLOW_ACTION',
    new.submission_id,
    jsonb_strip_nulls(jsonb_build_object(
      'workflow_audit_log_id', new.id,
      'action_type', new.action_type,
      'old_status', new.old_status,
      'new_status', new.new_status,
      'comments', new.comments
    )),
    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.record_system_workflow_activity() from public, anon, authenticated;

drop trigger if exists workflow_audit_to_system_activity
  on public.workflow_audit_logs;

create trigger workflow_audit_to_system_activity
after insert on public.workflow_audit_logs
for each row
execute function public.record_system_workflow_activity();

insert into public.system_activity_events (
  actor_id, actor_role, event_type, submission_id, details, created_at
)
select
  audit.action_by,
  coalesce(profile.role, 'system'),
  'WORKFLOW_ACTION',
  audit.submission_id,
  jsonb_strip_nulls(jsonb_build_object(
    'workflow_audit_log_id', audit.id,
    'action_type', audit.action_type,
    'old_status', audit.old_status,
    'new_status', audit.new_status,
    'comments', audit.comments
  )),
  audit.created_at
from public.workflow_audit_logs audit
left join public.profiles profile on profile.id = audit.action_by
on conflict do nothing;

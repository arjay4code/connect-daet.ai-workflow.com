create table if not exists public.workflow_backup_restore_staging (
  restore_id uuid not null,
  actor_id uuid not null,
  table_name text not null,
  chunk_index integer not null check (chunk_index >= 0),
  records jsonb not null check (
    jsonb_typeof(records) = 'array'
    and jsonb_array_length(records) <= 50
  ),
  created_at timestamptz not null default now(),
  primary key (restore_id, table_name, chunk_index)
);

create index if not exists workflow_backup_restore_staging_created_at_idx
  on public.workflow_backup_restore_staging (created_at);

alter table public.workflow_backup_restore_staging enable row level security;
revoke all on table public.workflow_backup_restore_staging from public, anon, authenticated;
grant all on table public.workflow_backup_restore_staging to service_role;

create or replace function public.merge_admin_app_backup(
  p_restore_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app_tables constant text[] := array[
    'profiles',
    'workflow_tracking_sequences',
    'workflow_office_document_types',
    'workflow_submissions',
    'workflow_routing_plans',
    'workflow_routing_steps',
    'workflow_submission_attachments',
    'workflow_submission_versions',
    'workflow_submission_revisions',
    'workflow_revision_files',
    'workflow_change_requests',
    'workflow_audit_logs',
    'workflow_notifications',
    'workflow_notification_dismissals',
    'workflow_notification_archives',
    'workflow_messages',
    'workflow_message_attachments',
    'workflow_message_reads',
    'workflow_email_outbox',
    'workflow_email_attempts',
    'workflow_email_provider_events',
    'workflow_document_retrievals',
    'workflow_document_retrieval_events',
    'workflow_final_decision_authorities',
    'workflow_submission_reward_ledger',
    'system_activity_events'
  ];
  target_table text;
  stage_chunk record;
  insert_columns text;
  select_columns text;
  imported_rows bigint := 0;
  skipped_profile_rows bigint := 0;
  rows_in_chunk bigint;
  foreign_key record;
  equality_condition text;
  all_not_null_condition text;
  all_null_condition text;
  validation_query text;
  has_orphans boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'A service-role connection is required to merge a database backup';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_actor_id
      and profile.role = 'system_admin'
      and profile.is_active = true
      and profile.is_removed = false
  ) then
    raise exception 'An active system administrator is required to merge a database backup';
  end if;

  if not exists (
    select 1
    from public.workflow_backup_restore_staging staging
    where staging.restore_id = p_restore_id
      and staging.actor_id = p_actor_id
  ) then
    raise exception 'No staged backup data was found for this restore';
  end if;

  if exists (
    select 1
    from public.workflow_backup_restore_staging staging
    where staging.restore_id = p_restore_id
      and staging.actor_id = p_actor_id
      and not (staging.table_name = any(app_tables))
  ) then
    raise exception 'The backup contains a table that is not allowed to be restored';
  end if;

  perform set_config('session_replication_role', 'replica', true);
  if current_setting('session_replication_role') <> 'replica' then
    raise exception 'Could not safely suspend workflow triggers for restore';
  end if;

  foreach target_table in array app_tables loop
    if target_table = 'profiles' then
      select coalesce(sum(jsonb_array_length(staging.records)), 0)
      into skipped_profile_rows
      from public.workflow_backup_restore_staging staging
      where staging.restore_id = p_restore_id
        and staging.actor_id = p_actor_id
        and staging.table_name = target_table;
      continue;
    end if;

    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'Required application table public.% is missing', target_table;
    end if;

    select
      string_agg(format('%I', column_info.column_name), ', ' order by column_info.ordinal_position),
      string_agg(format('record_value.%I', column_info.column_name), ', ' order by column_info.ordinal_position)
    into insert_columns, select_columns
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = target_table
      and column_info.is_generated = 'NEVER';

    if insert_columns is null or select_columns is null then
      raise exception 'Application table public.% has no restorable columns', target_table;
    end if;

    for stage_chunk in
      select staging.records
      from public.workflow_backup_restore_staging staging
      where staging.restore_id = p_restore_id
        and staging.actor_id = p_actor_id
        and staging.table_name = target_table
      order by staging.chunk_index
    loop
      if target_table = 'workflow_tracking_sequences' then
        execute
          'insert into public.workflow_tracking_sequences (tracking_year, last_sequence) '
          || 'select record_value.tracking_year, record_value.last_sequence '
          || 'from jsonb_populate_recordset(null::public.workflow_tracking_sequences, $1) as record_value '
          || 'on conflict (tracking_year) do update '
          || 'set last_sequence = greatest(workflow_tracking_sequences.last_sequence, excluded.last_sequence)'
        using stage_chunk.records;
      else
        execute format(
          'insert into public.%I (%s) overriding system value '
          || 'select %s from jsonb_populate_recordset(null::public.%I, $1) as record_value '
          || 'on conflict do nothing',
          target_table,
          insert_columns,
          select_columns,
          target_table
        )
        using stage_chunk.records;
      end if;

      get diagnostics rows_in_chunk = row_count;
      imported_rows := imported_rows + rows_in_chunk;
    end loop;
  end loop;

  perform set_config('session_replication_role', 'origin', true);

  for foreign_key in
    select
      constraint_info.conname,
      constraint_info.conkey as child_columns,
      constraint_info.confkey as parent_columns,
      constraint_info.confmatchtype as match_type,
      child_schema.nspname as child_schema,
      child_table.relname as child_table,
      parent_schema.nspname as parent_schema,
      parent_table.relname as parent_table
    from pg_constraint constraint_info
    join pg_class child_table on child_table.oid = constraint_info.conrelid
    join pg_namespace child_schema on child_schema.oid = child_table.relnamespace
    join pg_class parent_table on parent_table.oid = constraint_info.confrelid
    join pg_namespace parent_schema on parent_schema.oid = parent_table.relnamespace
    where constraint_info.contype = 'f'
      and child_schema.nspname = 'public'
  loop
    select
      string_agg(
        format('child.%I = parent.%I', child_attribute.attname, parent_attribute.attname),
        ' and ' order by child_key.ordinality
      ),
      string_agg(
        format('child.%I is not null', child_attribute.attname),
        ' and ' order by child_key.ordinality
      ),
      string_agg(
        format('child.%I is null', child_attribute.attname),
        ' and ' order by child_key.ordinality
      )
    into equality_condition, all_not_null_condition, all_null_condition
    from unnest(foreign_key.child_columns) with ordinality as child_key(attnum, ordinality)
    join unnest(foreign_key.parent_columns) with ordinality as parent_key(attnum, ordinality)
      on parent_key.ordinality = child_key.ordinality
    join pg_attribute child_attribute
      on child_attribute.attrelid = to_regclass(format('%I.%I', foreign_key.child_schema, foreign_key.child_table))
      and child_attribute.attnum = child_key.attnum
    join pg_attribute parent_attribute
      on parent_attribute.attrelid = to_regclass(format('%I.%I', foreign_key.parent_schema, foreign_key.parent_table))
      and parent_attribute.attnum = parent_key.attnum;

    if foreign_key.match_type = 'f' then
      validation_query := format(
        'select exists (select 1 from %I.%I as child '
        || 'where not (%s) and (not (%s) or not exists '
        || '(select 1 from %I.%I as parent where %s)))',
        foreign_key.child_schema,
        foreign_key.child_table,
        all_null_condition,
        all_not_null_condition,
        foreign_key.parent_schema,
        foreign_key.parent_table,
        equality_condition
      );
    else
      validation_query := format(
        'select exists (select 1 from %I.%I as child '
        || 'where %s and not exists '
        || '(select 1 from %I.%I as parent where %s))',
        foreign_key.child_schema,
        foreign_key.child_table,
        all_not_null_condition,
        foreign_key.parent_schema,
        foreign_key.parent_table,
        equality_condition
      );
    end if;

    execute validation_query into has_orphans;
    if has_orphans then
      raise exception 'Backup restore would violate foreign key constraint % on %.%',
        foreign_key.conname,
        foreign_key.child_schema,
        foreign_key.child_table;
    end if;
  end loop;

  delete from public.workflow_backup_restore_staging staging
  where staging.restore_id = p_restore_id
    and staging.actor_id = p_actor_id;

  return jsonb_build_object(
    'inserted_rows', imported_rows,
    'profile_rows_not_imported', skipped_profile_rows
  );
end;
$$;

revoke all on function public.merge_admin_app_backup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_admin_app_backup(uuid, uuid) to service_role;

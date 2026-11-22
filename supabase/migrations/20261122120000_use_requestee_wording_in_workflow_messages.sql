-- Use "requestee" instead of "submitter" in user-facing database messages.
--
-- Only wording changes. The 'submitter' role value, status values such as
-- closed_by_submitter, and column/function names are intentionally unchanged,
-- so existing accounts and stored data keep working exactly as before.
-- Existing activity log rows are historical records and are not rewritten.
--
-- Each affected function is rebuilt from its current live definition
-- (pg_get_functiondef) with only the exact phrases below replaced. That keeps
-- the latest logic, security settings, search_path, owner and grants intact,
-- instead of re-pasting function bodies that may have changed in later migrations.

do $$
declare
  target record;
  original_definition text;
  updated_definition text;
  updated_count integer := 0;
begin
  for target in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.prosrc ~ '(Only (a|the) submitter can|active submitter account|selected by submitter|returning the submission to the submitter|Submitter (permanently closed|reopened|responded|resubmitted))'
  loop
    original_definition := pg_get_functiondef(target.oid);
    updated_definition := original_definition;

    -- Exception messages shown when an action is not allowed.
    updated_definition := replace(updated_definition, 'Only a submitter can', 'Only a requestee can');
    updated_definition := replace(updated_definition, 'Only the submitter can', 'Only the requestee can');
    updated_definition := replace(updated_definition, 'An active submitter account is required', 'An active requestee account is required');
    updated_definition := replace(updated_definition, 'returning the submission to the submitter', 'returning the submission to the requestee');

    -- Activity / audit log notes written for new events.
    updated_definition := replace(updated_definition, 'selected by submitter: ', 'selected by requestee: ');
    updated_definition := replace(updated_definition, 'Submitter permanently closed', 'Requestee permanently closed');
    updated_definition := replace(updated_definition, 'Submitter reopened', 'Requestee reopened');
    updated_definition := replace(updated_definition, 'Submitter responded', 'Requestee responded');
    updated_definition := replace(updated_definition, 'Submitter resubmitted', 'Requestee resubmitted');

    if updated_definition <> original_definition then
      execute updated_definition;
      updated_count := updated_count + 1;
      raise notice 'Updated wording in %', target.signature;
    end if;
  end loop;

  raise notice 'Requestee wording applied to % function(s).', updated_count;
end;
$$;

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(
  new URL('../app/(dashboard)/workflow/user/upload/page.tsx', import.meta.url),
  'utf8',
);
const migration = await readFile(
  new URL(
    '../supabase/migrations/20261115130000_make_submission_context_optional.sql',
    import.meta.url,
  ),
  'utf8',
);

test('submission context is optional in the upload form and RPC validation', () => {
  const contextId = page.indexOf('id="submission-context"');
  const contextFieldStart = page.lastIndexOf('<textarea', contextId);
  const contextFieldEnd = page.indexOf('/>', contextId);
  const contextField = page.slice(contextFieldStart, contextFieldEnd);
  assert.ok(contextField);
  assert.match(page, /Request summary \/ context <span[^>]*>\(optional\)<\/span>/);
  assert.doesNotMatch(contextField, /\brequired\b/);
  assert.doesNotMatch(page, /!description\.trim\(\)/);
  assert.match(page, /submission_description: description\.trim\(\) \|\| null/);
  assert.doesNotMatch(migration, /coalesce\(length\(btrim\(submission_description\)\), 0\) = 0/);
  assert.match(migration, /nullif\(btrim\(submission_description\), ''\)/);
});

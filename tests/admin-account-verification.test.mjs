import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL('../app/api/admin/accounts/route.ts', import.meta.url),
  'utf8',
);
const verificationHandler = route.slice(
  route.indexOf('export async function GET'),
  route.indexOf('export async function POST'),
);

test('verification statuses use bounded per-profile Auth lookups', () => {
  assert.match(verificationHandler, /const adminClient = createClient[\s\S]*?const \{ data: profiles, error: profilesError \} = await adminClient\s*\.from\('profiles'\)[\s\S]*?\.select\('id'\)[\s\S]*?\.eq\('is_removed', false\)/);
  assert.match(verificationHandler, /VERIFICATION_LOOKUP_CONCURRENCY/);
  assert.match(verificationHandler, /auth\.admin\.getUserById\(profile\.id\)/);
  assert.doesNotMatch(verificationHandler, /auth\.admin\.listUsers/);
});

test('missing Auth users remain unknown and lookup failures are reported', () => {
  assert.match(verificationHandler, /result\.error\.status === 404/);
  assert.match(verificationHandler, /Could not load account verification status:/);
  assert.match(verificationHandler, /verificationStatuses\[result\.profileId\]/);
});

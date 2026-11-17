import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('root auth callback does not turn email confirmation codes into password recovery', async () => {
  const [home, callback] = await Promise.all([
    read('../app/page.tsx'),
    read('../app/auth/callback/route.ts'),
  ]);

  assert.match(home, /redirect\(`\/auth\/callback\?\$\{callbackParams\.toString\(\)\}`\)/);
  assert.doesNotMatch(home, /next:\s*'\/reset-password'/);
  assert.match(callback, /searchParams\.get\('next'\)\s*===\s*'\/reset-password'/);
  assert.match(callback, /redirectUrl\.searchParams\.set\('verified',\s*'1'\)/);
});

test('registration confirmation and password recovery keep distinct callback destinations', async () => {
  const [registration, login, recovery] = await Promise.all([
    read('../app/(auth)/register/page.tsx'),
    read('../app/(auth)/login/page.tsx'),
    read('../app/api/auth/password/request/route.ts'),
  ]);

  assert.match(registration, /emailRedirectTo:\s*`\$\{window\.location\.origin\}\/auth\/callback`/);
  assert.match(login, /type:\s*'signup'[\s\S]*emailRedirectTo:\s*`\$\{window\.location\.origin\}\/auth\/callback`/);
  assert.match(recovery, /redirectTo\.searchParams\.set\('next',\s*'\/reset-password'\)/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('root auth callback does not turn email confirmation codes into password recovery', async () => {
  const [home, callback, callbackFlow] = await Promise.all([
    read('../app/page.tsx'),
    read('../app/auth/callback/route.ts'),
    read('../lib/auth/callback-flow.ts'),
  ]);

  assert.match(home, /redirect\(`\/auth\/callback\?\$\{callbackParams\.toString\(\)\}`\)/);
  assert.doesNotMatch(home, /next:\s*'\/reset-password'/);
  assert.match(callback, /getAuthCallbackFlow\(request\.nextUrl\.searchParams\)/);
  assert.match(callback, /redirectUrl\.searchParams\.set\('verified',\s*'1'\)/);
});

test('registration confirmation and password recovery keep distinct callback destinations', async () => {
  const [registration, login, recovery, recoveryCallback] = await Promise.all([
    read('../app/(auth)/register/page.tsx'),
    read('../app/(auth)/login/page.tsx'),
    read('../app/api/auth/password/request/route.ts'),
    read('../app/auth/password-recovery/callback/route.ts'),
  ]);

  assert.match(registration, /emailRedirectTo:\s*`\$\{window\.location\.origin\}\/auth\/callback\?flow=confirmation`/);
  assert.match(login, /type:\s*'signup'[\s\S]*emailRedirectTo:\s*`\$\{window\.location\.origin\}\/auth\/callback\?flow=confirmation`/);
  assert.match(recovery, /new URL\('\/auth\/password-recovery\/callback',\s*applicationOrigin\)/);
  assert.match(recoveryCallback, /searchParams\.forEach/);
  assert.match(recoveryCallback, /callbackUrl\.searchParams\.set\('next',\s*'\/reset-password'\)/);
});

test('password recovery uses the public auth API without a service-role account lookup', async () => {
  const [recovery, forgotPassword] = await Promise.all([
    read('../app/api/auth/password/request/route.ts'),
    read('../app/(auth)/forgot-password/page.tsx'),
  ]);

  assert.match(recovery, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(recovery, /resetPasswordForEmail/);
  assert.match(recovery, /process\.env\.NODE_ENV === 'development'[\s\S]*request\.nextUrl\.origin/);
  assert.doesNotMatch(recovery, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(recovery, /\.from\('profiles'\)/);
  assert.doesNotMatch(recovery, /status:\s*404/);
  assert.match(forgotPassword, /If an account exists for this email/);
  assert.match(forgotPassword, /response\.status === 429/);
});

test('registration prevents duplicate requests and explains Supabase email rate limits', async () => {
  const registration = await read('../app/(auth)/register/page.tsx');

  assert.match(registration, /const isSubmitting = useRef\(false\)/);
  assert.match(registration, /if \(isSubmitting\.current\) return/);
  assert.match(registration, /error\.code === 'over_email_send_rate_limit'/);
  assert.match(registration, /Email confirmation is temporarily rate-limited/);
  assert.match(registration, /errorMessage !== '\{\}'/);
});

test('confirmation resend handles rate limits and releases its loading state after failures', async () => {
  const login = await read('../app/(auth)/login/page.tsx');

  assert.match(login, /resendError\.code === 'over_email_send_rate_limit'/);
  assert.match(login, /Too many confirmation email requests/);
  assert.match(login, /finally \{\s*setResendingConfirmation\(false\)/);
});

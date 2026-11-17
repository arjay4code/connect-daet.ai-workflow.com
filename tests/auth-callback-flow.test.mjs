import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthCallbackFlow } from '../lib/auth/callback-flow.ts';

test('explicit confirmation flow takes precedence over a stale reset destination', () => {
  const searchParams = new URLSearchParams({
    flow: 'confirmation',
    next: '/reset-password',
  });

  assert.equal(getAuthCallbackFlow(searchParams), 'confirmation');
});

test('explicit recovery flow is identified', () => {
  assert.equal(
    getAuthCallbackFlow(new URLSearchParams('flow=recovery')),
    'recovery'
  );
});

test('legacy password reset links remain supported', () => {
  assert.equal(
    getAuthCallbackFlow(new URLSearchParams('next=%2Freset-password')),
    'recovery'
  );
});

test('unknown or absent flow defaults to confirmation', () => {
  assert.equal(
    getAuthCallbackFlow(new URLSearchParams('flow=unknown')),
    'confirmation'
  );
});

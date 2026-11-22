import assert from 'node:assert/strict';
import test from 'node:test';
import { getPasswordValidationError, MINIMUM_PASSWORD_LENGTH } from '../lib/auth/password.ts';

test('password requirement is shared and enforces a 12-character minimum', () => {
  assert.equal(MINIMUM_PASSWORD_LENGTH, 12);
  assert.equal(getPasswordValidationError('12345678901'), 'Password must be at least 12 characters.');
  assert.equal(getPasswordValidationError('123456789012'), null);
  assert.equal(getPasswordValidationError('correct horse battery staple'), null);
});

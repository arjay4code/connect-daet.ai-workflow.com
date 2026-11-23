import assert from 'node:assert/strict';
import test from 'node:test';
import { getPasswordValidationError, MINIMUM_PASSWORD_LENGTH } from '../lib/auth/password.ts';

test('password requirement enforces length, uppercase, number, and special character', () => {
  assert.equal(MINIMUM_PASSWORD_LENGTH, 12);
  assert.equal(getPasswordValidationError('12345678901'), 'Password must be at least 12 characters.');
  assert.equal(
    getPasswordValidationError('abcdefghij1!'),
    'Password must include at least one uppercase letter.',
  );
  assert.equal(
    getPasswordValidationError('Abcdefghijk!'),
    'Password must include at least one number.',
  );
  assert.equal(
    getPasswordValidationError('Abcdefghij12'),
    'Password must include at least one special character.',
  );
  assert.equal(
    getPasswordValidationError('Abcdefghij 1'),
    'Password must include at least one special character.',
  );
  assert.equal(getPasswordValidationError('Abcdefghij1!'), null);
});

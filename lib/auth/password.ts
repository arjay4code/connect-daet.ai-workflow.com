export const MINIMUM_PASSWORD_LENGTH = 12;
export const PASSWORD_REQUIREMENTS_HINT =
  `At least ${MINIMUM_PASSWORD_LENGTH} characters, including an uppercase letter, a number, and a special character (such as ! or #).`;

export function getPasswordValidationError(password: string) {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return 'Password must include at least one special character.';
  }
  return null;
}

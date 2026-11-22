// Client-side error logging that keeps expected, recoverable conditions out of
// the Next.js dev error overlay.
//
// In development, every `console.error` in the browser opens the red overlay.
// Network blips ("Failed to fetch"), aborted/timed-out requests and expired
// sign-in sessions are normal at runtime — the page already shows a friendly
// message and lets the user retry — so they are logged as warnings instead.
// Anything else is still logged with `console.error` so real bugs stay visible.

const TRANSIENT_MESSAGE_PATTERN =
  /failed to fetch|fetch failed|networkerror|network ?error|network request failed|load failed|err_network|err_internet_disconnected|err_connection|connection (?:was )?(?:reset|refused|closed)|timed? ?out|timeout|aborted|the user aborted|session (?:is )?(?:invalid|expired|missing)|session has expired|jwt expired|invalid jwt|refresh token|auth session missing|sign in again/i;

const TRANSIENT_ERROR_NAMES = new Set(['AbortError', 'TimeoutError', 'AuthSessionMissingError']);

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [record.name, record.message, record.details, record.hint, record.code]
      .filter((part) => typeof part === 'string')
      .join(' ');
  }
  return '';
}

/** True for network failures, aborted/timed-out requests and expired sessions. */
export function isTransientClientError(value: unknown): boolean {
  if (value && typeof value === 'object' && 'name' in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === 'string' && TRANSIENT_ERROR_NAMES.has(name)) return true;
  }
  return TRANSIENT_MESSAGE_PATTERN.test(describe(value));
}

/**
 * Drop-in replacement for `console.error(context, ...details)` in client code.
 * Expected runtime conditions are logged with `console.warn`.
 */
export function logClientError(context: string, ...details: unknown[]): void {
  const transient = details.some(isTransientClientError) || (details.length === 0 && isTransientClientError(context));
  if (transient) {
    console.warn(context, ...details);
    return;
  }
  console.error(context, ...details);
}

export type AuthCallbackFlow = 'confirmation' | 'recovery';

export function getAuthCallbackFlow(searchParams: URLSearchParams): AuthCallbackFlow {
  const flow = searchParams.get('flow');
  if (flow === 'confirmation' || flow === 'recovery') return flow;

  return searchParams.get('next') === '/reset-password'
    ? 'recovery'
    : 'confirmation';
}

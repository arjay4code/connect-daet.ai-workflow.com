import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (
    typeof payload !== 'object'
    || payload === null
    || !('email' in payload)
    || typeof payload.email !== 'string'
    || !payload.email.trim()
  ) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }

  let applicationOrigin: URL;
  try {
    const applicationUrl = process.env.NODE_ENV === 'development'
      ? request.nextUrl.origin
      : process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    applicationOrigin = new URL(applicationUrl);
    if (!['http:', 'https:'].includes(applicationOrigin.protocol)) {
      throw new Error('The application URL must use HTTP or HTTPS.');
    }
  } catch (error) {
    console.error('Password recovery has an invalid application URL:', error);
    return NextResponse.json(
      { error: 'Password recovery is not configured correctly.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    console.error('Password recovery is missing Supabase public configuration.');
    return NextResponse.json(
      { error: 'Password recovery is not configured correctly.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const normalizedEmail = payload.email.trim().toLowerCase();
  const redirectTo = new URL('/auth/password-recovery/callback', applicationOrigin);
  const { error } = await supabase.auth.resetPasswordForEmail(
    normalizedEmail,
    { redirectTo: redirectTo.toString() }
  );

  if (error) {
    console.error('Password recovery request failed:', error.message);
    if (error.status === 429) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please wait and try again later.' },
        { status: 429, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      { error: 'We could not process your request right now. Please try again later.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { requested: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

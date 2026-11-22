import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

type PresenceEvent = 'session_started' | 'activity' | 'heartbeat' | 'session_ended';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }

  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return NextResponse.json({ error: 'Sign in to record system activity.' }, { status: 401 });
  }

  let body: { sessionId?: unknown; event?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const eventValue = body.event;
  if (!UUID_PATTERN.test(sessionId) || !['session_started', 'activity', 'heartbeat', 'session_ended'].includes(String(eventValue))) {
    return NextResponse.json({ error: 'A valid session and activity event are required.' }, { status: 400 });
  }
  const event = eventValue as PresenceEvent;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey || /^(replace-with|your[-_ ]|changeme|<)/i.test(serviceRoleKey)) {
    console.error('System activity is unavailable: Supabase server configuration is missing or invalid.');
    return NextResponse.json({ error: 'System activity is not configured correctly.' }, { status: 500 });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Your session is invalid. Sign in again.' }, { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, is_active, is_removed')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Could not verify the activity owner:', profileError.message);
    return NextResponse.json({ error: 'Could not verify the activity owner.' }, { status: 503 });
  }
  if (!profile || !profile.is_active || profile.is_removed) {
    return NextResponse.json({ error: 'This account cannot record system activity.' }, { status: 403 });
  }

  const { data: existingSession, error: sessionLookupError } = await adminClient
    .from('workflow_user_presence_sessions')
    .select('user_id, ended_at')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (sessionLookupError) {
    console.error('Could not load the activity session:', sessionLookupError.message);
    return NextResponse.json({ error: 'Could not update session activity.' }, { status: 503 });
  }
  if (existingSession && existingSession.user_id !== user.id) {
    return NextResponse.json({ error: 'This activity session belongs to another account.' }, { status: 409 });
  }
  if (existingSession?.ended_at && event !== 'session_started' && event !== 'session_ended') {
    return NextResponse.json({ error: 'This activity session has ended. Start a new session to continue.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const presence = adminClient.from('workflow_user_presence_sessions');
  let recordSessionStart = false;

  if (event === 'session_ended') {
    if (!existingSession || existingSession.ended_at) {
      return NextResponse.json({ recorded: true });
    }
    const { error } = await presence
      .update({ last_seen_at: now, ended_at: now })
      .eq('session_id', sessionId)
      .eq('user_id', user.id);
    if (error) {
      console.error('Could not end the activity session:', error.message);
      return NextResponse.json({ error: 'Could not record the end of this session.' }, { status: 503 });
    }
  } else if (!existingSession || existingSession.ended_at) {
    const values = {
      session_id: sessionId,
      user_id: user.id,
      started_at: now,
      last_seen_at: now,
      last_activity_at: now,
      ended_at: null,
    };
    const { error } = existingSession
      ? await presence.update(values).eq('session_id', sessionId).eq('user_id', user.id)
      : await presence.insert(values);
    if (error) {
      console.error('Could not start the activity session:', error.message);
      return NextResponse.json({ error: 'Could not start the activity session.' }, { status: 503 });
    }
    recordSessionStart = true;
  } else {
    const updates: { last_seen_at: string; last_activity_at?: string } = { last_seen_at: now };
    if (event === 'activity') updates.last_activity_at = now;
    const { error } = await presence
      .update(updates)
      .eq('session_id', sessionId)
      .eq('user_id', user.id);
    if (error) {
      console.error('Could not refresh activity presence:', error.message);
      return NextResponse.json({ error: 'Could not refresh activity presence.' }, { status: 503 });
    }
  }

  const eventType = event === 'session_ended'
    ? 'SESSION_ENDED'
    : recordSessionStart
      ? 'SESSION_STARTED'
      : null;
  if (eventType) {
    const { error } = await adminClient
      .from('system_activity_events')
      .insert({
        actor_id: user.id,
        actor_role: profile.role,
        event_type: eventType,
        details: { session_id: sessionId },
      });
    if (error) {
      console.error(`${eventType} was processed, but its activity log could not be written:`, error.message);
      return NextResponse.json({
        error: 'Session presence was updated, but its system log entry could not be recorded.',
      }, { status: 503 });
    }
  }

  return NextResponse.json({ recorded: true });
}

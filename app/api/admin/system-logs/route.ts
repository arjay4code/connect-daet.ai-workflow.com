import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const OFFICER_ROLES = [
  'tourism_officer',
  'municipal_treasurer',
  'mayor_office',
  'sangguniang_bayan',
];

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }

  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return NextResponse.json({ error: 'Sign in as an administrator to view system logs.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey || /^(replace-with|your[-_ ]|changeme|<)/i.test(serviceRoleKey)) {
    console.error('System logs are unavailable: Supabase server configuration is missing or invalid.');
    return NextResponse.json({ error: 'System logs are not configured correctly.' }, { status: 500 });
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
  const { data: adminProfile, error: adminProfileError } = await adminClient
    .from('profiles')
    .select('role, is_active, is_removed')
    .eq('id', user.id)
    .maybeSingle();
  if (adminProfileError) {
    console.error('Could not verify system log access:', adminProfileError.message);
    return NextResponse.json({ error: 'Could not verify administrator access.' }, { status: 503 });
  }
  if (adminProfile?.role !== 'system_admin' || !adminProfile.is_active || adminProfile.is_removed) {
    return NextResponse.json({ error: 'Only active administrators can view system logs.' }, { status: 403 });
  }

  const [
    { data: officers, error: officersError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, email, full_name, role, is_active')
      .eq('is_removed', false)
      .in('role', OFFICER_ROLES)
      .order('full_name', { ascending: true }),
    adminClient
      .from('system_activity_events')
      .select('id, actor_id, actor_role, event_type, submission_id, details, created_at')
      .order('created_at', { ascending: false })
      .limit(150),
  ]);
  if (officersError || eventsError) {
    console.error('Could not load system monitoring data:', officersError?.message || eventsError?.message);
    return NextResponse.json({ error: 'Could not load system monitoring data.' }, { status: 503 });
  }

  const officerIds = (officers ?? []).map((officer) => officer.id);
  let presenceSessions: {
    session_id: string;
    user_id: string;
    started_at: string;
    last_seen_at: string;
    last_activity_at: string;
    ended_at: string | null;
  }[] = [];
  if (officerIds.length > 0) {
    const { data, error } = await adminClient
      .from('workflow_user_presence_sessions')
      .select('session_id, user_id, started_at, last_seen_at, last_activity_at, ended_at')
      .in('user_id', officerIds)
      .order('last_seen_at', { ascending: false })
      .limit(1000);
    if (error) {
      console.error('Could not load officer presence sessions:', error.message);
      return NextResponse.json({ error: 'Could not load officer presence sessions.' }, { status: 503 });
    }
    presenceSessions = data ?? [];
  }

  const actorIds = [...new Set((events ?? []).flatMap((event) => event.actor_id ? [event.actor_id] : []))];
  let actorProfiles: { id: string; email: string | null; full_name: string | null }[] = [];
  if (actorIds.length > 0) {
    const { data, error } = await adminClient
      .from('profiles')
      .select('id, email, full_name')
      .in('id', actorIds);
    if (error) {
      console.error('Could not load system log actor names:', error.message);
      return NextResponse.json({ error: 'Could not load system log actor names.' }, { status: 503 });
    }
    actorProfiles = data ?? [];
  }
  const actorById = new Map(actorProfiles.map((profile) => [profile.id, profile]));

  return NextResponse.json({
    officers: officers ?? [],
    presenceSessions,
    events: (events ?? []).map((event) => ({
      ...event,
      actor: event.actor_id ? actorById.get(event.actor_id) ?? null : null,
    })),
  }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('User deletion is missing Supabase server configuration.');
    return NextResponse.json(
      { error: 'User deletion is not configured correctly.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const response = NextResponse.json(
    { deleted: false },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'You must be signed in to delete a user.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { data: actorProfile, error: actorProfileError } = await supabase
    .from('profiles')
    .select('role, is_active, is_removed')
    .eq('id', user.id)
    .maybeSingle();
  if (actorProfileError) {
    console.error('Could not verify user deletion permissions:', actorProfileError.message);
    return NextResponse.json(
      { error: 'Could not verify administrator permissions.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (
    actorProfile?.role !== 'system_admin'
    || !actorProfile.is_active
    || actorProfile.is_removed
  ) {
    return NextResponse.json(
      { error: 'Only administrators can delete users.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { id: targetUserId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return NextResponse.json(
      { error: 'A valid user ID is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own administrator account.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from('profiles')
    .select('role, email, is_active, is_removed')
    .eq('id', targetUserId)
    .maybeSingle();
  if (targetProfileError) {
    console.error('Could not look up user for deletion:', targetProfileError.message);
    return NextResponse.json(
      { error: 'Could not look up the user to delete.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!targetProfile || targetProfile.is_removed) {
    return NextResponse.json(
      { error: 'This user no longer exists.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (targetProfile.is_active && targetProfile.role === 'system_admin') {
    const { count, error: adminCountError } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'system_admin')
      .eq('is_active', true)
      .eq('is_removed', false);
    if (adminCountError) {
      console.error('Could not verify remaining administrators:', adminCountError.message);
      return NextResponse.json(
        { error: 'Could not verify whether another administrator remains.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'The last administrator account cannot be deleted.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  const { data: authAccount, error: authLookupError } =
    await adminClient.auth.admin.getUserById(targetUserId);
  if (authLookupError || !authAccount.user) {
    console.error('Could not look up Auth account for removal:', authLookupError?.message);
    return NextResponse.json(
      { error: 'Could not find the authentication account to remove.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const retiredEmail = `removed+${targetUserId}@account.invalid`;
  const { error: retireError } = await adminClient.auth.admin.updateUserById(targetUserId, {
    email: retiredEmail,
    email_confirm: true,
    ban_duration: '876000h',
    user_metadata: { account_status: 'removed' },
  });
  if (retireError) {
    console.error('Could not retire the Auth account:', retireError.message);
    return NextResponse.json(
      { error: 'Could not disable this account and release its email. Please try again.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { error: deactivateError } = await adminClient
    .from('profiles')
    .update({
      email: retiredEmail,
      full_name: 'Removed user',
      is_active: false,
      is_removed: true,
    })
    .eq('id', targetUserId);
  if (deactivateError) {
    console.error('Auth account retired, but profile anonymization failed:', deactivateError.message);
    return NextResponse.json(
      {
        error: 'The old sign-in is disabled and its email is released, but request-history anonymization failed. Retry this action to complete it.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { error: logError } = await adminClient
    .from('system_activity_events')
    .insert({
      actor_id: user.id,
      actor_role: actorProfile.role,
      event_type: 'ACCOUNT_REMOVED',
      details: { target_user_id: targetUserId, email: targetProfile.email },
    });
  if (logError) {
    console.error('Account removed, but the system activity log could not be written:', logError.message);
    return NextResponse.json(
      { removed: true, warning: 'The account was removed, but its system log entry could not be recorded.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const successResponse = NextResponse.json(
    { removed: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.cookies.getAll().forEach((cookie) => successResponse.cookies.set(cookie));
  return successResponse;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Account status update is missing Supabase server configuration.');
    return NextResponse.json({ error: 'Account status update is not configured correctly.' }, { status: 500 });
  }

  const cookieResponse = new NextResponse();
  const cookieClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => cookieResponse.cookies.set(name, value, options));
      },
    },
  });
  const withAuthCookies = (response: NextResponse) => {
    cookieResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const authClient = accessToken
    ? createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    : cookieClient;
  const { data: { user }, error: authError } = accessToken
    ? await authClient.auth.getUser(accessToken)
    : await authClient.auth.getUser();
  if (authError || !user) {
    return withAuthCookies(NextResponse.json({ error: 'Sign in as an administrator to update account status.' }, { status: 401 }));
  }

  let body: { is_active?: unknown };
  try {
    body = await request.json();
  } catch {
    return withAuthCookies(NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }));
  }
  if (typeof body.is_active !== 'boolean') {
    return withAuthCookies(NextResponse.json({ error: 'A valid account status is required.' }, { status: 400 }));
  }

  const { id: targetUserId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return withAuthCookies(NextResponse.json({ error: 'A valid user ID is required.' }, { status: 400 }));
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: actorProfile, error: actorProfileError } = await adminClient
    .from('profiles')
    .select('role, is_active, is_removed')
    .eq('id', user.id)
    .maybeSingle();
  if (actorProfileError) {
    console.error('Could not verify account status permissions:', actorProfileError.message);
    return withAuthCookies(NextResponse.json({ error: 'Could not verify administrator permissions.' }, { status: 503 }));
  }
  if (actorProfile?.role !== 'system_admin' || !actorProfile.is_active || actorProfile.is_removed) {
    return withAuthCookies(NextResponse.json({ error: 'Only active administrators can update account status.' }, { status: 403 }));
  }

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from('profiles')
    .select('id, email, role, is_active, is_removed')
    .eq('id', targetUserId)
    .maybeSingle();
  if (targetProfileError) {
    console.error('Could not load account status target:', targetProfileError.message);
    return withAuthCookies(NextResponse.json({ error: 'Could not load the account to update.' }, { status: 503 }));
  }
  if (!targetProfile || targetProfile.is_removed) {
    return withAuthCookies(NextResponse.json({ error: 'This account cannot be reactivated or disabled.' }, { status: 404 }));
  }
  if (!body.is_active && targetUserId === user.id) {
    return withAuthCookies(NextResponse.json({ error: 'You cannot disable your own administrator account.' }, { status: 400 }));
  }
  if (targetProfile.is_active === body.is_active) {
    return withAuthCookies(NextResponse.json({ is_active: targetProfile.is_active }));
  }

  if (!body.is_active && targetProfile.role === 'system_admin') {
    const { count, error: adminCountError } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'system_admin')
      .eq('is_active', true)
      .eq('is_removed', false);
    if (adminCountError) {
      console.error('Could not verify remaining administrators:', adminCountError.message);
      return withAuthCookies(NextResponse.json({ error: 'Could not verify whether another administrator remains.' }, { status: 503 }));
    }
    if ((count ?? 0) <= 1) {
      return withAuthCookies(NextResponse.json({ error: 'The last active administrator cannot be disabled.' }, { status: 409 }));
    }
  }

  const { error: authAccountError } = await adminClient.auth.admin.getUserById(targetUserId);
  if (authAccountError) {
    console.error('Could not load account authentication status:', authAccountError.message);
    return withAuthCookies(NextResponse.json({ error: 'Could not update this account right now.' }, { status: 503 }));
  }

  const updateAuthenticationBan = (enabled: boolean) => adminClient.auth.admin.updateUserById(targetUserId, {
    ban_duration: enabled ? 'none' : '876000h',
  });

  if (body.is_active) {
    const { error } = await updateAuthenticationBan(true);
    if (error) {
      console.error('Could not re-enable account sign-in:', error.message);
      return withAuthCookies(NextResponse.json({ error: 'Could not re-enable sign-in for this account.' }, { status: 503 }));
    }
  }

  const { error: profileUpdateError } = await adminClient
    .from('profiles')
    .update({ is_active: body.is_active })
    .eq('id', targetUserId);
  if (profileUpdateError) {
    console.error('Could not update account active status:', profileUpdateError.message);
    if (body.is_active) {
      const { error: rollbackError } = await updateAuthenticationBan(false);
      if (rollbackError) console.error('Could not restore the disabled sign-in after status update failed:', rollbackError.message);
    }
    return withAuthCookies(NextResponse.json({ error: 'Could not update the account status.' }, { status: 503 }));
  }

  if (!body.is_active) {
    const { error } = await updateAuthenticationBan(false);
    if (error) {
      console.error('Could not disable account sign-in:', error.message);
      const { error: rollbackError } = await adminClient
        .from('profiles')
        .update({ is_active: true })
        .eq('id', targetUserId);
      if (rollbackError) console.error('Could not restore the active profile status after sign-in disable failed:', rollbackError.message);
      return withAuthCookies(NextResponse.json({ error: 'Could not disable sign-in for this account.' }, { status: 503 }));
    }
  }

  const eventType = body.is_active ? 'ACCOUNT_ENABLED' : 'ACCOUNT_DISABLED';
  const { error: logError } = await adminClient
    .from('system_activity_events')
    .insert({
      actor_id: user.id,
      actor_role: actorProfile.role,
      event_type: eventType,
      details: { target_user_id: targetUserId, email: targetProfile.email },
    });
  if (logError) {
    console.error('Account status changed, but the system activity log could not be written:', logError.message);
    return withAuthCookies(NextResponse.json({
      is_active: body.is_active,
      warning: 'The account status changed, but its system log entry could not be recorded.',
    }, { status: 503 }));
  }

  return withAuthCookies(NextResponse.json({ is_active: body.is_active }));
}

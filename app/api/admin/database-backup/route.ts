import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  APP_BACKUP_BUCKETS,
  APP_BACKUP_PAGE_SIZE,
  APP_BACKUP_TABLES,
  APP_RESTORE_CHUNK_SIZE,
  isAppBackupBucket,
  isAppBackupTable,
  isSafeStoragePath,
} from '@/lib/workflow/database-backup';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

type AdminContext = {
  adminClient: SupabaseClient<any, 'public', any>;
  actorId: string;
  supabaseUrl: string;
};

async function authorizeAdmin(request: NextRequest): Promise<
  { context: AdminContext; error?: never }
  | { context?: never; error: NextResponse }
> {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return { error: NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 }) };
  }

  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return { error: NextResponse.json({ error: 'Sign in as an administrator to use database backup.' }, { status: 401 }) };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey || /^(replace-with|your[-_ ]|changeme|<)/i.test(serviceRoleKey)) {
    console.error('Admin database backup is unavailable: Supabase server configuration is missing or invalid.');
    return { error: NextResponse.json({ error: 'Database backup is not configured correctly.' }, { status: 500 }) };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Your session is invalid. Sign in again.' }, { status: 401 }) };
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
    console.error('Could not verify database backup access:', profileError.message);
    return {
      error: NextResponse.json(
        { error: 'Could not verify administrator access. Apply the admin activity and database backup migrations.' },
        { status: 503 }
      ),
    };
  }
  if (profile?.role !== 'system_admin' || !profile.is_active || profile.is_removed) {
    return { error: NextResponse.json({ error: 'Only active administrators can use database backup.' }, { status: 403 }) };
  }

  return { context: { adminClient, actorId: user.id, supabaseUrl } };
}

function isValidRestoreId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value)
    && value.length <= APP_RESTORE_CHUNK_SIZE
    && value.every((record) => (
      typeof record === 'object'
      && record !== null
      && !Array.isArray(record)
    ));
}

export async function GET(request: NextRequest) {
  const authorization = await authorizeAdmin(request);
  if (authorization.error) return authorization.error;

  const { adminClient, supabaseUrl } = authorization.context;
  const query = request.nextUrl.searchParams;
  const resource = query.get('resource');

  if (resource === 'manifest') {
    return NextResponse.json({
      tables: APP_BACKUP_TABLES,
      buckets: APP_BACKUP_BUCKETS,
      projectHost: new URL(supabaseUrl).host,
    }, { headers: NO_STORE_HEADERS });
  }

  if (resource === 'table') {
    const table = query.get('name') ?? '';
    const offsetValue = Number(query.get('offset') ?? '0');
    if (!isAppBackupTable(table) || !Number.isSafeInteger(offsetValue) || offsetValue < 0) {
      return NextResponse.json({ error: 'Choose a valid backup table and page offset.' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from(table)
      .select('*')
      .range(offsetValue, offsetValue + APP_BACKUP_PAGE_SIZE - 1);
    if (error) {
      console.error(`Could not export application table ${table}:`, error.message);
      return NextResponse.json({ error: `Could not export ${table}: ${error.message}` }, { status: 503 });
    }
    return NextResponse.json({ records: data ?? [], hasMore: (data?.length ?? 0) === APP_BACKUP_PAGE_SIZE }, {
      headers: NO_STORE_HEADERS,
    });
  }

  if (resource === 'storage-list') {
    const bucket = query.get('bucket') ?? '';
    const prefix = query.get('prefix') ?? '';
    const offset = Number(query.get('offset') ?? '0');
    if (
      !isAppBackupBucket(bucket)
      || (prefix !== '' && !isSafeStoragePath(prefix))
      || !Number.isSafeInteger(offset)
      || offset < 0
    ) {
      return NextResponse.json({ error: 'Choose a valid storage bucket and folder.' }, { status: 400 });
    }

    const { data, error } = await adminClient.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      console.error(`Could not list storage bucket ${bucket}:`, error.message);
      return NextResponse.json({ error: `Could not list ${bucket}: ${error.message}` }, { status: 503 });
    }

    return NextResponse.json({
      items: (data ?? []).map((item) => ({
        name: item.name,
        isFolder: item.id === null && item.metadata === null,
        size: typeof item.metadata?.size === 'number' ? item.metadata.size : 0,
        contentType: typeof item.metadata?.mimetype === 'string' ? item.metadata.mimetype : 'application/octet-stream',
      })),
    }, { headers: NO_STORE_HEADERS });
  }

  if (resource === 'storage-download-url') {
    const bucket = query.get('bucket') ?? '';
    const path = query.get('path') ?? '';
    if (!isAppBackupBucket(bucket) || !isSafeStoragePath(path)) {
      return NextResponse.json({ error: 'Choose a valid stored file.' }, { status: 400 });
    }

    const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(path, 120);
    if (error) {
      console.error(`Could not create a backup download URL for ${bucket}/${path}:`, error.message);
      return NextResponse.json({ error: `Could not download ${path}: ${error.message}` }, { status: 503 });
    }
    return NextResponse.json({ signedUrl: data.signedUrl }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ error: 'Choose a supported database backup resource.' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeAdmin(request);
  if (authorization.error) return authorization.error;
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Expected a JSON request body.' }, { status: 415 });
  }

  let body: {
    action?: unknown;
    restoreId?: unknown;
    table?: unknown;
    chunkIndex?: unknown;
    records?: unknown;
    bucket?: unknown;
    path?: unknown;
    contentType?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const { adminClient, actorId } = authorization.context;
  const restoreId = body.restoreId;
  if (!isValidRestoreId(restoreId)) {
    return NextResponse.json({ error: 'A valid restore ID is required.' }, { status: 400 });
  }

  if (body.action === 'stage-table') {
    const table = typeof body.table === 'string' ? body.table : '';
    const chunkIndex = body.chunkIndex;
    const records = body.records;
    if (
      !isAppBackupTable(table)
      || typeof chunkIndex !== 'number'
      || !Number.isSafeInteger(chunkIndex)
      || chunkIndex < 0
      || !isRecordArray(records)
    ) {
      return NextResponse.json({ error: 'The restore table chunk is invalid.' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('workflow_backup_restore_staging')
      .upsert({
        restore_id: restoreId,
        actor_id: actorId,
        table_name: table,
        chunk_index: chunkIndex,
        records,
      }, { onConflict: 'restore_id,table_name,chunk_index' });
    if (error) {
      console.error(`Could not stage backup table ${table}:`, error.message);
      return NextResponse.json({
        error: `Could not stage ${table}. Apply the database backup migration and try again.`,
      }, { status: 503 });
    }
    return NextResponse.json({ staged: records.length }, { headers: NO_STORE_HEADERS });
  }

  if (body.action === 'storage-upload-url') {
    const bucket = typeof body.bucket === 'string' ? body.bucket : '';
    const path = typeof body.path === 'string' ? body.path : '';
    const contentType = typeof body.contentType === 'string' && body.contentType.length <= 255
      ? body.contentType
      : 'application/octet-stream';
    if (!isAppBackupBucket(bucket) || !isSafeStoragePath(path)) {
      return NextResponse.json({ error: 'Choose a valid storage bucket and file path.' }, { status: 400 });
    }

    const slashIndex = path.lastIndexOf('/');
    const prefix = slashIndex < 0 ? '' : path.slice(0, slashIndex);
    const fileName = slashIndex < 0 ? path : path.slice(slashIndex + 1);
    const { data: existingObjects, error: existingError } = await adminClient.storage.from(bucket).list(prefix, {
      limit: 100,
      search: fileName,
    });
    if (existingError) {
      console.error(`Could not check for existing storage object ${bucket}/${path}:`, existingError.message);
      return NextResponse.json({ error: `Could not check ${path}: ${existingError.message}` }, { status: 503 });
    }
    if (existingObjects?.some((object) => object.name === fileName && object.id !== null)) {
      return NextResponse.json({ exists: true }, { headers: NO_STORE_HEADERS });
    }

    const { data, error } = await adminClient.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
    if (error) {
      console.error(`Could not create a restore upload URL for ${bucket}/${path}:`, error.message);
      return NextResponse.json({ error: `Could not prepare ${path} for restore: ${error.message}` }, { status: 503 });
    }
    return NextResponse.json({
      exists: false,
      token: data.token,
      path: data.path,
      contentType,
    }, { headers: NO_STORE_HEADERS });
  }

  if (body.action === 'finalize') {
    const { data, error } = await adminClient.rpc('merge_admin_app_backup', {
      p_restore_id: restoreId,
      p_actor_id: actorId,
    });
    if (error) {
      console.error('Application backup merge failed:', error.message);
      return NextResponse.json({
        error: `Database merge failed and was rolled back: ${error.message}`,
      }, { status: 409 });
    }
    return NextResponse.json({ result: data }, { headers: NO_STORE_HEADERS });
  }

  if (body.action === 'cleanup') {
    const { error } = await adminClient
      .from('workflow_backup_restore_staging')
      .delete()
      .eq('restore_id', restoreId)
      .eq('actor_id', actorId);
    if (error) {
      console.error('Could not clean up staged restore data:', error.message);
      return NextResponse.json({ error: 'Could not clean up the staged restore data.' }, { status: 503 });
    }
    return NextResponse.json({ cleaned: true }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ error: 'Choose a supported restore action.' }, { status: 400 });
}

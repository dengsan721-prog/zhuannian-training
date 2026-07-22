import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { loadEdgeRuntimeConfig, type EdgeRuntimeConfig } from '../_shared/env.ts';
import { hmacSha256 } from '../_shared/hashes.ts';
import { json, preflight } from '../_shared/http.ts';
import { normalizeChineseMobile } from '../_shared/phone.ts';

const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requestIdFrom(request: Request): Promise<string | null | 'too_large'> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return 'too_large';
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return 'too_large';

  try {
    const body = JSON.parse(text) as unknown;
    if (typeof body !== 'object' || body === null || !('requestId' in body)) return null;
    return typeof body.requestId === 'string' && UUID.test(body.requestId) ? body.requestId : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  let config: EdgeRuntimeConfig;
  try {
    config = loadEdgeRuntimeConfig();
  } catch {
    return json(
      { error: 'service_unavailable' },
      503,
      Deno.env.get('APP_ORIGIN') ?? 'null',
    );
  }

  if (request.method === 'OPTIONS') return preflight(config.appOrigin);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, config.appOrigin);

  const authorization = request.headers.get('authorization');
  if (!authorization?.match(/^Bearer\s+\S+$/i)) {
    return json({ error: 'unauthorized' }, 401, config.appOrigin);
  }

  const requestId = await requestIdFrom(request);
  if (requestId === 'too_large') return json({ error: 'request_too_large' }, 413, config.appOrigin);
  if (!requestId) return json({ error: 'invalid_request' }, 400, config.appOrigin);

  const caller = createClient(config.supabaseUrl, config.anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  const phone = user?.phone ? normalizeChineseMobile(user.phone) : null;
  if (userError || !user || !phone) {
    return json({ error: 'unauthorized' }, 401, config.appOrigin);
  }

  const phoneHmac = await hmacSha256(phone, config.phoneHmacSecret);
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('complete_enrollment', {
    p_request_id: requestId,
    p_user_id: user.id,
    p_phone_hmac: phoneHmac,
  }).single();
  if (error || !data || typeof data.cohort_id !== 'string') {
    return json({ error: 'enrollment_failed' }, 409, config.appOrigin);
  }

  return json({ cohortId: data.cohort_id }, 200, config.appOrigin);
});

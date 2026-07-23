import { json, preflight, readBoundedJson } from '../_shared/http.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CompleteEnrollmentDependencies {
  appOrigin: string;
  authenticate(authorization: string): Promise<{
    userId: string;
    phone: string;
  } | null>;
  complete(input: {
    requestId: string;
    userId: string;
    phone: string;
  }): Promise<{ cohortId: string }>;
}

function requestIdFrom(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('requestId' in value)) return null;
  const requestId = (value as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' && UUID.test(requestId) ? requestId : null;
}

export function createCompleteEnrollmentHandler(
  dependencies: CompleteEnrollmentDependencies,
) {
  return async function handleRequest(request: Request): Promise<Response> {
    const { appOrigin } = dependencies;
    if (request.method === 'OPTIONS') return preflight(appOrigin);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, appOrigin);

    const body = await readBoundedJson(request);
    if (!body.ok && body.error === 'unsupported_media_type') {
      return json({ error: 'unsupported_media_type' }, 415, appOrigin);
    }
    if (!body.ok && body.error === 'request_too_large') {
      return json({ error: 'request_too_large' }, 413, appOrigin);
    }
    const requestId = body.ok ? requestIdFrom(body.value) : null;
    if (!requestId) return json({ error: 'invalid_request' }, 400, appOrigin);

    const authorization = request.headers.get('authorization');
    if (!authorization?.match(/^Bearer\s+\S+$/i)) {
      return json({ error: 'unauthorized' }, 401, appOrigin);
    }

    let identity: Awaited<ReturnType<CompleteEnrollmentDependencies['authenticate']>>;
    try {
      identity = await dependencies.authenticate(authorization);
    } catch {
      return json({ error: 'unauthorized' }, 401, appOrigin);
    }
    if (!identity) return json({ error: 'unauthorized' }, 401, appOrigin);

    try {
      const result = await dependencies.complete({
        requestId,
        userId: identity.userId,
        phone: identity.phone,
      });
      return json(result, 200, appOrigin);
    } catch {
      return json({ error: 'enrollment_failed' }, 409, appOrigin);
    }
  };
}

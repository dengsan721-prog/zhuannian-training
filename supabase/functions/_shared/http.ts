const ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info, x-retry-count';
const DEFAULT_MAX_BODY_BYTES = 4096;

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: 'unsupported_media_type' | 'request_too_large' | 'invalid_json' };

export function corsHeaders(appOrigin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': appOrigin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status: number, appOrigin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(appOrigin),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function preflight(appOrigin: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(appOrigin) });
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  return value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

export async function readBoundedJson(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<BoundedJsonResult> {
  if (!isJsonContentType(request.headers.get('content-type'))) {
    return { ok: false, error: 'unsupported_media_type' };
  }

  const rawLength = request.headers.get('content-length');
  if (rawLength !== null) {
    const contentLength = Number(rawLength);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await request.body?.cancel();
      return { ok: false, error: 'request_too_large' };
    }
  }

  if (!request.body) return { ok: false, error: 'invalid_json' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, error: 'request_too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: 'invalid_json' };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}

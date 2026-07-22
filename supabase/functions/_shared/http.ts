const ALLOWED_HEADERS = 'authorization, apikey, content-type, x-client-info, x-retry-count';

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

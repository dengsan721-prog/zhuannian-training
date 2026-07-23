import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { loadEdgeRuntimeConfig, type EdgeRuntimeConfig } from '../_shared/env.ts';
import { hmacSha256 } from '../_shared/hashes.ts';
import { json } from '../_shared/http.ts';
import { createCompleteEnrollmentAdapter } from './adapter.ts';
import { createCompleteEnrollmentHandler } from './handler.ts';

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

  return createCompleteEnrollmentHandler(createCompleteEnrollmentAdapter({
    config,
    createClient,
    hmacSha256,
  }))(request);
});

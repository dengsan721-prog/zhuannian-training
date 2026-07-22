export interface EdgeRuntimeConfig {
  appOrigin: string;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  phoneHmacSecret: string;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error('edge_runtime_not_configured');
  return value;
}

export function loadEdgeRuntimeConfig(): EdgeRuntimeConfig {
  return {
    appOrigin: required('APP_ORIGIN'),
    supabaseUrl: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    phoneHmacSecret: required('PHONE_HMAC_SECRET'),
  };
}

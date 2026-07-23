import type { EdgeRuntimeConfig } from '../_shared/env.ts';
import { normalizeChineseMobile } from '../_shared/phone.ts';
import type { CompleteEnrollmentDependencies } from './handler.ts';

interface ClientFactory {
  (
    url: string,
    key: string,
    options: Record<string, unknown>,
  ): unknown;
}

interface CallerClient {
  auth: {
    getUser(token: string): Promise<{
      data: {
        user: {
          id: string;
          phone?: string | null;
          phone_confirmed_at?: string | null;
        } | null;
      };
      error: unknown;
    }>;
  };
}

interface AdminClient {
  rpc(name: string, input: Record<string, unknown>): {
    single(): Promise<{ data: unknown; error: unknown }>;
  };
}

interface AdapterOptions {
  config: EdgeRuntimeConfig;
  createClient: ClientFactory;
  hmacSha256(value: string, secret: string): Promise<string>;
}

export function createCompleteEnrollmentAdapter(
  options: AdapterOptions,
): CompleteEnrollmentDependencies {
  const { config } = options;
  return {
    appOrigin: config.appOrigin,
    async authenticate(authorization) {
      const token = authorization.replace(/^Bearer\s+/i, '');
      const caller = options.createClient(config.supabaseUrl, config.anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      }) as CallerClient;
      const { data: { user }, error } = await caller.auth.getUser(token);
      const phone = user?.phone ? normalizeChineseMobile(user.phone) : null;
      if (error || !user || !phone || !user.phone_confirmed_at) return null;
      return { userId: user.id, phone };
    },
    async complete({ requestId, userId, phone }) {
      const phoneHmac = await options.hmacSha256(phone, config.phoneHmacSecret);
      const admin = options.createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as AdminClient;
      const { data, error } = await admin.rpc('complete_enrollment', {
        p_request_id: requestId,
        p_user_id: userId,
        p_phone_hmac: phoneHmac,
      }).single();
      const row = data as { cohort_id?: unknown } | null;
      if (error || typeof row?.cohort_id !== 'string') {
        throw new Error('enrollment_failed');
      }
      return { cohortId: row.cohort_id };
    },
  };
}

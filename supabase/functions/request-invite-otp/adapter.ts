import type { EdgeRuntimeConfig } from '../_shared/env.ts';
import type { RequestInviteOtpDependencies } from './handler.ts';

interface RpcResult {
  data: unknown;
  error: unknown;
}

interface RpcBuilder {
  single(): Promise<RpcResult>;
}

interface AuthErrorLike {
  code?: unknown;
}

interface AdminClient {
  rpc(name: string, input: Record<string, unknown>): RpcBuilder;
  auth: {
    admin: {
      createUser(input: {
        phone: string;
        phone_confirm: false;
      }): Promise<{
        data: { user: { id: string } | null };
        error: unknown;
      }>;
    };
  };
}

interface OtpClient {
  auth: {
    signInWithOtp(input: {
      phone: string;
      options: { shouldCreateUser: false };
    }): Promise<{ error: unknown }>;
  };
}

type ClientFactory = (
  url: string,
  key: string,
  options: Record<string, unknown>,
) => unknown;

interface AdapterOptions {
  config: EdgeRuntimeConfig;
  createClient: ClientFactory;
  sha256(value: string): Promise<string>;
  hmacSha256(value: string, secret: string): Promise<string>;
  isAuthApiError(error: unknown): error is AuthErrorLike;
}

interface ChallengeRpcRow {
  decision: 'accepted' | 'invalid_invite' | 'rate_limited' | 'delivery_pending';
  request_id: string | null;
  delivery_attempt_id: string | null;
  should_send: boolean;
  retry_after_seconds: number;
}

function isChallengeRow(value: unknown): value is ChallengeRpcRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    ['accepted', 'invalid_invite', 'rate_limited', 'delivery_pending'].includes(String(row.decision))
    && (typeof row.request_id === 'string' || row.request_id === null)
    && (typeof row.delivery_attempt_id === 'string' || row.delivery_attempt_id === null)
    && typeof row.should_send === 'boolean'
    && typeof row.retry_after_seconds === 'number'
  );
}

export function createRequestInviteOtpAdapter(
  options: AdapterOptions,
): RequestInviteOtpDependencies {
  const { config } = options;
  const admin = options.createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as AdminClient;
  const otp = options.createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as OtpClient;

  return {
    appOrigin: config.appOrigin,
    async requestChallenge(input) {
      const [inviteHash, phoneHmac] = await Promise.all([
        options.sha256(input.inviteCode),
        options.hmacSha256(input.phone, config.phoneHmacSecret),
      ]);
      const { data, error } = await admin.rpc('request_enrollment_challenge', {
        p_invite_hash: inviteHash,
        p_phone_hmac: phoneHmac,
        p_adult_attested: input.adultAttested,
        p_privacy_consent_version: input.privacyConsentVersion,
        p_service_boundary_version: input.serviceBoundaryVersion,
      }).single();
      if (error || !isChallengeRow(data)) throw new Error('challenge_request_failed');
      if (data.decision === 'invalid_invite') {
        return {
          status: 'invalid_invite',
          shouldSendOtp: false,
          retryAfterSeconds: 0,
        };
      }
      if (!data.request_id) throw new Error('challenge_request_failed');
      if (data.decision === 'rate_limited') {
        return {
          status: 'rate_limited',
          requestId: data.request_id,
          shouldSendOtp: false,
          retryAfterSeconds: data.retry_after_seconds,
        };
      }
      if (data.decision === 'delivery_pending') {
        if (!data.delivery_attempt_id) throw new Error('challenge_request_failed');
        return {
          status: 'delivery_pending',
          requestId: data.request_id,
          deliveryAttemptId: data.delivery_attempt_id,
          shouldSendOtp: false,
          retryAfterSeconds: data.retry_after_seconds,
        };
      }
      if (data.should_send && !data.delivery_attempt_id) {
        throw new Error('challenge_request_failed');
      }
      return {
        status: 'accepted',
        requestId: data.request_id,
        ...(data.delivery_attempt_id ? { deliveryAttemptId: data.delivery_attempt_id } : {}),
        shouldSendOtp: data.should_send,
        retryAfterSeconds: data.retry_after_seconds,
      };
    },
    async sendOtp({ phone, requestId }) {
      let created: Awaited<ReturnType<AdminClient['auth']['admin']['createUser']>>;
      try {
        created = await admin.auth.admin.createUser({ phone, phone_confirm: false });
      } catch {
        return { status: 'failed' };
      }

      if (created.error) {
        const isExistingPhone = (
          options.isAuthApiError(created.error)
          && created.error.code === 'phone_exists'
        );
        if (!isExistingPhone) return { status: 'failed' };
      } else {
        const userId = created.data.user?.id;
        if (!userId) return { status: 'failed' };
        const phoneHmac = await options.hmacSha256(phone, config.phoneHmacSecret);
        const bound = await admin.rpc('bind_enrollment_challenge_user', {
          p_request_id: requestId,
          p_user_id: userId,
          p_phone_hmac: phoneHmac,
        }).single();
        const row = bound.data as { bound?: unknown } | null;
        if (bound.error || row?.bound !== true) return { status: 'failed' };
      }

      try {
        const result = await otp.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: false },
        });
        if (!result.error) return { status: 'sent' };
        return { status: options.isAuthApiError(result.error) ? 'failed' : 'unknown' };
      } catch {
        return { status: 'unknown' };
      }
    },
    async finalizeDelivery({ requestId, deliveryAttemptId, status }) {
      const result = await admin.rpc('finalize_enrollment_otp_delivery', {
        p_delivery_attempt_id: deliveryAttemptId,
        p_request_id: requestId,
        p_status: status,
      }).single();
      const row = result.data as {
        delivery_status?: unknown;
        request_id?: unknown;
      } | null;
      if (
        result.error
        || row?.delivery_status !== status
        || row.request_id !== requestId
      ) {
        throw new Error('delivery_finalize_failed');
      }
    },
  };
}

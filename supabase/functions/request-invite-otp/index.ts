import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { loadEdgeRuntimeConfig, type EdgeRuntimeConfig } from '../_shared/env.ts';
import { hmacSha256, sha256 } from '../_shared/hashes.ts';
import { json } from '../_shared/http.ts';
import {
  createRequestInviteOtpHandler,
  type ChallengeDecision,
  type RequestInviteOtpDependencies,
} from './handler.ts';

interface ChallengeRpcRow {
  decision: 'accepted' | 'invalid_invite' | 'rate_limited';
  request_id: string | null;
  should_send: boolean;
  retry_after_seconds: number;
}

function dependencies(config: EdgeRuntimeConfig): RequestInviteOtpDependencies {
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    appOrigin: config.appOrigin,
    async requestChallenge(input): Promise<ChallengeDecision> {
      const [inviteHash, phoneHmac] = await Promise.all([
        sha256(input.inviteCode),
        hmacSha256(input.phone, config.phoneHmacSecret),
      ]);
      const { data, error } = await admin.rpc('request_enrollment_challenge', {
        p_invite_hash: inviteHash,
        p_phone_hmac: phoneHmac,
        p_adult_attested: input.adultAttested,
        p_privacy_consent_version: input.privacyConsentVersion,
        p_service_boundary_version: input.serviceBoundaryVersion,
      }).single();
      if (error || !data) throw new Error('challenge_request_failed');

      const row = data as ChallengeRpcRow;
      if (row.decision === 'invalid_invite') {
        return {
          status: 'invalid_invite',
          shouldSendOtp: false,
          retryAfterSeconds: 0,
        };
      }
      if (!row.request_id) throw new Error('challenge_request_failed');
      if (row.decision === 'rate_limited') {
        return {
          status: 'rate_limited',
          requestId: row.request_id,
          shouldSendOtp: false,
          retryAfterSeconds: row.retry_after_seconds,
        };
      }
      return {
        status: 'accepted',
        requestId: row.request_id,
        shouldSendOtp: row.should_send,
        retryAfterSeconds: row.retry_after_seconds,
      };
    },
    async sendOtp({ phone }) {
      await admin.auth.admin.createUser({ phone, phone_confirm: false });
      const { error } = await admin.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false },
      });
      if (error) throw new Error('sms_unavailable');
    },
  };
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
  return createRequestInviteOtpHandler(dependencies(config))(request);
});

import { json, preflight, readBoundedJson } from '../_shared/http.ts';
import { normalizeChineseMobile } from '../_shared/phone.ts';

const CONSENT_VERSION = '2026-07-22';
const INVITE_CODE = /^[A-Z0-9]{6,64}$/;

export interface ValidatedInviteRequest {
  phone: string;
  inviteCode: string;
  adultAttested: true;
  privacyConsentVersion: string;
  serviceBoundaryVersion: string;
}

export type ChallengeDecision = {
  status: 'accepted';
  requestId: string;
  deliveryAttemptId?: string;
  shouldSendOtp: boolean;
  retryAfterSeconds: number;
} | {
  status: 'invalid_invite';
  requestId?: string;
  shouldSendOtp: false;
  retryAfterSeconds: number;
} | {
  status: 'rate_limited';
  requestId: string;
  shouldSendOtp: false;
  retryAfterSeconds: number;
} | {
  status: 'delivery_pending';
  requestId: string;
  deliveryAttemptId: string;
  shouldSendOtp: false;
  retryAfterSeconds: number;
};

export interface RequestInviteOtpDependencies {
  appOrigin: string;
  requestChallenge(input: ValidatedInviteRequest): Promise<ChallengeDecision>;
  sendOtp(input: {
    phone: string;
    requestId: string;
  }): Promise<{ status: 'sent' | 'failed' | 'unknown' }>;
  finalizeDelivery(input: {
    requestId: string;
    deliveryAttemptId: string;
    status: 'sent' | 'failed';
  }): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createRequestInviteOtpHandler(dependencies: RequestInviteOtpDependencies) {
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
    const parsed = body.ok ? body.value : null;
    if (!body.ok || !isRecord(parsed)) {
      return json({ error: 'invalid_request' }, 400, appOrigin);
    }

    if (
      parsed.adultAttested !== true
      || parsed.privacyConsentVersion !== CONSENT_VERSION
      || parsed.serviceBoundaryVersion !== CONSENT_VERSION
    ) {
      return json({ error: 'consent_required' }, 400, appOrigin);
    }

    if (typeof parsed.phone !== 'string' || typeof parsed.inviteCode !== 'string') {
      return json({ error: 'invalid_request' }, 400, appOrigin);
    }
    const phone = normalizeChineseMobile(parsed.phone);
    const inviteCode = parsed.inviteCode.trim().toUpperCase();
    if (!phone || !INVITE_CODE.test(inviteCode)) {
      return json({ error: 'invalid_request' }, 400, appOrigin);
    }

    let decision: ChallengeDecision;
    try {
      decision = await dependencies.requestChallenge({
        phone,
        inviteCode,
        adultAttested: true,
        privacyConsentVersion: CONSENT_VERSION,
        serviceBoundaryVersion: CONSENT_VERSION,
      });
    } catch {
      return json({ error: 'request_failed' }, 500, appOrigin);
    }

    if (decision.status === 'invalid_invite') {
      return json({ error: 'invite_invalid_or_expired' }, 404, appOrigin);
    }
    if (decision.status === 'rate_limited') {
      return json({ error: 'retry_later', retryAfterSeconds: decision.retryAfterSeconds }, 429, appOrigin);
    }
    if (decision.status === 'delivery_pending') {
      return json({
        error: 'sms_delivery_unconfirmed',
        retryAfterSeconds: decision.retryAfterSeconds,
      }, 503, appOrigin);
    }

    if (decision.shouldSendOtp) {
      if (!decision.deliveryAttemptId) {
        return json({ error: 'request_failed' }, 500, appOrigin);
      }
      let delivery: { status: 'sent' | 'failed' | 'unknown' };
      try {
        delivery = await dependencies.sendOtp({ phone, requestId: decision.requestId });
      } catch {
        return json({ error: 'sms_delivery_unconfirmed' }, 503, appOrigin);
      }

      if (delivery.status === 'unknown') {
        return json({ error: 'sms_delivery_unconfirmed' }, 503, appOrigin);
      }
      try {
        await dependencies.finalizeDelivery({
          requestId: decision.requestId,
          deliveryAttemptId: decision.deliveryAttemptId,
          status: delivery.status,
        });
      } catch {
        return json({ error: 'sms_delivery_unconfirmed' }, 503, appOrigin);
      }
      if (delivery.status === 'failed') {
        return json({ error: 'sms_unavailable' }, 503, appOrigin);
      }
    }

    return json({
      accepted: true,
      requestId: decision.requestId,
      retryAfterSeconds: decision.retryAfterSeconds,
    }, 202, appOrigin);
  };
}

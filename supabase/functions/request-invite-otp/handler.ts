import { json, preflight } from '../_shared/http.ts';
import { normalizeChineseMobile } from '../_shared/phone.ts';

const CONSENT_VERSION = '2026-07-22';
const MAX_BODY_BYTES = 4096;
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
};

export interface RequestInviteOtpDependencies {
  appOrigin: string;
  requestChallenge(input: ValidatedInviteRequest): Promise<ChallengeDecision>;
  sendOtp(input: { phone: string; requestId: string }): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function boundedJson(request: Request): Promise<unknown | 'too_large' | 'invalid_json'> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return 'too_large';

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return 'too_large';
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return 'invalid_json';
  }
}

export function createRequestInviteOtpHandler(dependencies: RequestInviteOtpDependencies) {
  return async function handleRequest(request: Request): Promise<Response> {
    const { appOrigin } = dependencies;
    if (request.method === 'OPTIONS') return preflight(appOrigin);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, appOrigin);

    const parsed = await boundedJson(request);
    if (parsed === 'too_large') return json({ error: 'request_too_large' }, 413, appOrigin);
    if (parsed === 'invalid_json' || !isRecord(parsed)) {
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

    if (decision.shouldSendOtp) {
      try {
        await dependencies.sendOtp({ phone, requestId: decision.requestId });
      } catch {
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

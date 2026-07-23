import { describe, expect, it, vi } from 'vitest';
import {
  createRequestInviteOtpHandler,
  type RequestInviteOtpDependencies,
} from '../request-invite-otp/handler';

const appOrigin = 'https://pilot.example.com';
type ReviewDependencies = RequestInviteOtpDependencies & {
  finalizeDelivery(input: {
    requestId: string;
    deliveryAttemptId: string;
    status: 'sent' | 'failed';
  }): Promise<void>;
};

function validRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/functions/v1/request-invite-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: appOrigin,
    },
    body: JSON.stringify({
      phone: '138 0013 8000',
      inviteCode: ' abc123 ',
      adultAttested: true,
      privacyConsentVersion: '2026-07-22',
      serviceBoundaryVersion: '2026-07-22',
      ...overrides,
    }),
  });
}

function dependencies(
  overrides: Partial<ReviewDependencies> = {},
): ReviewDependencies {
  return {
    appOrigin,
    requestChallenge: vi.fn().mockResolvedValue({
      status: 'accepted',
      requestId: 'request-1',
      deliveryAttemptId: 'attempt-1',
      shouldSendOtp: true,
      retryAfterSeconds: 60,
    }),
    sendOtp: vi.fn().mockResolvedValue({ status: 'sent' }),
    finalizeDelivery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('request-invite-otp handler', () => {
  it('canonicalizes a Chinese mobile before requesting and sending a challenge', async () => {
    const deps = dependencies();
    const handler = createRequestInviteOtpHandler(deps);

    const response = await handler(validRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      requestId: 'request-1',
      retryAfterSeconds: 60,
    });
    expect(deps.requestChallenge).toHaveBeenCalledWith({
      phone: '+8613800138000',
      inviteCode: 'ABC123',
      adultAttested: true,
      privacyConsentVersion: '2026-07-22',
      serviceBoundaryVersion: '2026-07-22',
    });
    expect(deps.sendOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      requestId: 'request-1',
    });
    expect(deps.finalizeDelivery).toHaveBeenCalledWith({
      requestId: 'request-1',
      deliveryAttemptId: 'attempt-1',
      status: 'sent',
    });
    expect(response.headers.get('access-control-allow-origin')).toBe(appOrigin);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'authorization, apikey, content-type, x-client-info, x-retry-count',
    );
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    [{ adultAttested: false }, 'consent_required'],
    [{ privacyConsentVersion: 'old-version' }, 'consent_required'],
    [{ serviceBoundaryVersion: 'old-version' }, 'consent_required'],
    [{ phone: '12800138000' }, 'invalid_request'],
    [{ inviteCode: 'A'.repeat(65) }, 'invalid_request'],
  ])('rejects invalid consent or input before database access', async (input, error) => {
    const deps = dependencies();
    const response = await createRequestInviteOtpHandler(deps)(validRequest(input));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(deps.requestChallenge).not.toHaveBeenCalled();
    expect(deps.sendOtp).not.toHaveBeenCalled();
  });

  it('reuses a live request during the cooldown without sending another OTP', async () => {
    const deps = dependencies({
      requestChallenge: vi.fn().mockResolvedValue({
        status: 'accepted',
        requestId: 'same-request',
        shouldSendOtp: false,
        retryAfterSeconds: 42,
      }),
    });

    const response = await createRequestInviteOtpHandler(deps)(validRequest());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      requestId: 'same-request',
      retryAfterSeconds: 42,
    });
    expect(deps.sendOtp).not.toHaveBeenCalled();
    expect(deps.finalizeDelivery).not.toHaveBeenCalled();
  });

  it('fails closed while an earlier provider delivery is still unconfirmed', async () => {
    const deps = dependencies({
      requestChallenge: vi.fn().mockResolvedValue({
        status: 'delivery_pending',
        requestId: 'request-1',
        deliveryAttemptId: 'attempt-1',
        shouldSendOtp: false,
        retryAfterSeconds: 300,
      }),
    });

    const response = await createRequestInviteOtpHandler(deps)(validRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'sms_delivery_unconfirmed',
      retryAfterSeconds: 300,
    });
    expect(deps.sendOtp).not.toHaveBeenCalled();
    expect(deps.finalizeDelivery).not.toHaveBeenCalled();
  });

  it('returns a generic rate response without sending OTP', async () => {
    const deps = dependencies({
      requestChallenge: vi.fn().mockResolvedValue({
        status: 'rate_limited',
        requestId: 'request-1',
        shouldSendOtp: false,
        retryAfterSeconds: 480,
      }),
    });

    const response = await createRequestInviteOtpHandler(deps)(validRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'retry_later', retryAfterSeconds: 480 });
    expect(deps.sendOtp).not.toHaveBeenCalled();
  });

  it('redacts phone, hashes, keys and raw database errors', async () => {
    const deps = dependencies({
      requestChallenge: vi.fn().mockRejectedValue(new Error(
        'phone=+8613800138000 phone_hmac=secret-hmac invite_hash=secret-hash service_role=secret-key',
      )),
    });

    const response = await createRequestInviteOtpHandler(deps)(validRequest());
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe('{"error":"request_failed"}');
    expect(body).not.toContain('+8613800138000');
    expect(body).not.toContain('secret-hmac');
    expect(body).not.toContain('secret-hash');
    expect(body).not.toContain('secret-key');
  });

  it('redacts raw SMS provider errors', async () => {
    const deps = dependencies({
      sendOtp: vi.fn().mockRejectedValue(new Error('provider rejected +8613800138000 with credential secret-key')),
    });

    const response = await createRequestInviteOtpHandler(deps)(validRequest());
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"error":"sms_delivery_unconfirmed"}');
    expect(body).not.toContain('+8613800138000');
    expect(body).not.toContain('secret-key');
    expect(deps.finalizeDelivery).not.toHaveBeenCalled();
  });

  it('records an explicit provider rejection as failed without consuming a successful send', async () => {
    const deps = dependencies({
      sendOtp: vi.fn().mockResolvedValue({ status: 'failed' }),
    });

    const response = await createRequestInviteOtpHandler(deps)(validRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'sms_unavailable' });
    expect(deps.finalizeDelivery).toHaveBeenCalledWith({
      requestId: 'request-1',
      deliveryAttemptId: 'attempt-1',
      status: 'failed',
    });
  });

  it('does not claim acceptance when successful provider delivery cannot be finalized', async () => {
    const deps = dependencies({
      finalizeDelivery: vi.fn().mockRejectedValue(new Error('database secret detail')),
    });

    const response = await createRequestInviteOtpHandler(deps)(validRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'sms_delivery_unconfirmed' });
  });

  it('rejects oversized JSON without parsing it', async () => {
    const deps = dependencies();
    const response = await createRequestInviteOtpHandler(deps)(validRequest({ padding: 'x'.repeat(4096) }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'request_too_large' });
    expect(deps.requestChallenge).not.toHaveBeenCalled();
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded'])(
    'rejects hostile simple POST content type %s before dependencies',
    async (contentType) => {
      const deps = dependencies();
      const request = new Request('http://localhost/functions/v1/request-invite-otp', {
        method: 'POST',
        headers: { 'Content-Type': contentType, Origin: appOrigin },
        body: JSON.stringify({
          phone: '13800138000',
          inviteCode: 'ABC123',
          adultAttested: true,
          privacyConsentVersion: '2026-07-22',
          serviceBoundaryVersion: '2026-07-22',
        }),
      });

      const response = await createRequestInviteOtpHandler(deps)(request);

      expect(response.status).toBe(415);
      await expect(response.json()).resolves.toEqual({ error: 'unsupported_media_type' });
      expect(deps.requestChallenge).not.toHaveBeenCalled();
      expect(deps.sendOtp).not.toHaveBeenCalled();
    },
  );

  it('cancels a chunked body as soon as it exceeds 4096 bytes', async () => {
    const deps = dependencies();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"padding":"'));
        controller.enqueue(new Uint8Array(4096));
        controller.enqueue(new Uint8Array(4096));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('http://localhost/functions/v1/request-invite-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Origin: appOrigin },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await createRequestInviteOtpHandler(deps)(request);

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(deps.requestChallenge).not.toHaveBeenCalled();
    expect(deps.sendOtp).not.toHaveBeenCalled();
  });

  it('answers preflight with the same exact-origin no-store headers', async () => {
    const deps = dependencies();
    const request = new Request('http://localhost/functions/v1/request-invite-otp', {
      method: 'OPTIONS',
      headers: { Origin: appOrigin },
    });

    const response = await createRequestInviteOtpHandler(deps)(request);

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(appOrigin);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

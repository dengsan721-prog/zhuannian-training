import { describe, expect, it, vi } from 'vitest';
import { createRequestInviteOtpAdapter } from '../request-invite-otp/adapter';

const config = {
  appOrigin: 'https://pilot.example.com',
  supabaseUrl: 'https://project.supabase.co',
  anonKey: 'publishable-key',
  serviceRoleKey: 'service-role-key',
  phoneHmacSecret: 'phone-hmac-secret',
};

function rpcResult(data: unknown, error: unknown = null) {
  return { single: vi.fn().mockResolvedValue({ data, error }) };
}

function clients() {
  const admin = {
    rpc: vi.fn(),
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'new-user-id' } },
          error: null,
        }),
      },
    },
  };
  const auth = {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  };
  const createClient = vi.fn()
    .mockReturnValueOnce(admin)
    .mockReturnValueOnce(auth);
  return { admin, auth, createClient };
}

function adapter(overrides: Record<string, unknown> = {}) {
  const sdk = clients();
  const built = createRequestInviteOtpAdapter({
    config,
    createClient: sdk.createClient,
    sha256: vi.fn().mockResolvedValue('invite-hash'),
    hmacSha256: vi.fn().mockResolvedValue('phone-hmac'),
    isAuthApiError: (error: unknown) => (
      typeof error === 'object' && error !== null && 'isAuthApiError' in error
    ),
    ...overrides,
  });
  return { ...sdk, built };
}

describe('request-invite-otp adapter', () => {
  it('uses service role only for private RPC/admin work and anon for OTP sending', () => {
    const { createClient } = adapter();

    expect(createClient).toHaveBeenNthCalledWith(1, config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(createClient).toHaveBeenNthCalledWith(2, config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it('hashes invite and phone before calling the challenge RPC', async () => {
    const sdk = adapter();
    sdk.admin.rpc.mockReturnValue(rpcResult({
      decision: 'accepted',
      request_id: 'request-1',
      delivery_attempt_id: 'attempt-1',
      should_send: true,
      retry_after_seconds: 60,
    }));

    await expect(sdk.built.requestChallenge({
      phone: '+8613800138000',
      inviteCode: 'ABC123',
      adultAttested: true,
      privacyConsentVersion: '2026-07-22',
      serviceBoundaryVersion: '2026-07-22',
    })).resolves.toEqual({
      status: 'accepted',
      requestId: 'request-1',
      deliveryAttemptId: 'attempt-1',
      shouldSendOtp: true,
      retryAfterSeconds: 60,
    });

    expect(sdk.admin.rpc).toHaveBeenCalledWith('request_enrollment_challenge', {
      p_invite_hash: 'invite-hash',
      p_phone_hmac: 'phone-hmac',
      p_adult_attested: true,
      p_privacy_consent_version: '2026-07-22',
      p_service_boundary_version: '2026-07-22',
    });
  });

  it('binds a newly created user before asking the anon auth client to send OTP', async () => {
    const sdk = adapter();
    sdk.admin.rpc.mockReturnValue(rpcResult({ bound: true }));

    await expect(sdk.built.sendOtp({
      phone: '+8613800138000',
      requestId: 'request-1',
    })).resolves.toEqual({ status: 'sent' });

    expect(sdk.admin.auth.admin.createUser).toHaveBeenCalledWith({
      phone: '+8613800138000',
      phone_confirm: false,
    });
    expect(sdk.admin.rpc).toHaveBeenCalledWith('bind_enrollment_challenge_user', {
      p_request_id: 'request-1',
      p_user_id: 'new-user-id',
      p_phone_hmac: 'phone-hmac',
    });
    expect(sdk.auth.auth.signInWithOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      options: { shouldCreateUser: false },
    });
  });

  it('allows only the exact phone_exists Auth API error for an existing user', async () => {
    const phoneExists = { isAuthApiError: true, code: 'phone_exists' };
    const sdk = adapter();
    sdk.admin.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: phoneExists,
    });

    await expect(sdk.built.sendOtp({
      phone: '+8613800138000',
      requestId: 'request-1',
    })).resolves.toEqual({ status: 'sent' });

    expect(sdk.admin.rpc).not.toHaveBeenCalledWith(
      'bind_enrollment_challenge_user',
      expect.anything(),
    );
    expect(sdk.auth.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('does not send for any non-phone_exists create error', async () => {
    const sdk = adapter();
    sdk.admin.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { isAuthApiError: true, code: 'user_already_exists' },
    });

    await expect(sdk.built.sendOtp({
      phone: '+8613800138000',
      requestId: 'request-1',
    })).resolves.toEqual({ status: 'failed' });
    expect(sdk.auth.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('does not send when binding the newly created user fails', async () => {
    const sdk = adapter();
    sdk.admin.rpc.mockReturnValue(rpcResult(null, new Error('raw database secret')));

    await expect(sdk.built.sendOtp({
      phone: '+8613800138000',
      requestId: 'request-1',
    })).resolves.toEqual({ status: 'failed' });
    expect(sdk.auth.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('finalizes the exact attempt through the service-only RPC', async () => {
    const sdk = adapter();
    sdk.admin.rpc.mockReturnValue(rpcResult({
      delivery_status: 'sent',
      request_id: 'request-1',
    }));

    await sdk.built.finalizeDelivery({
      requestId: 'request-1',
      deliveryAttemptId: 'attempt-1',
      status: 'sent',
    });

    expect(sdk.admin.rpc).toHaveBeenCalledWith('finalize_enrollment_otp_delivery', {
      p_delivery_attempt_id: 'attempt-1',
      p_request_id: 'request-1',
      p_status: 'sent',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createCompleteEnrollmentAdapter } from '../complete-enrollment/adapter';

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

describe('complete-enrollment adapter', () => {
  it('validates the bearer token with anon config and binds the HMAC in service RPC', async () => {
    const caller = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', phone: '+86 138 0013 8000' } },
          error: null,
        }),
      },
    };
    const admin = {
      rpc: vi.fn().mockReturnValue(rpcResult({
        cohort_id: 'cohort-1',
      })),
    };
    const createClient = vi.fn()
      .mockReturnValueOnce(caller)
      .mockReturnValueOnce(admin);
    const hmacSha256 = vi.fn().mockResolvedValue('phone-hmac');
    const built = createCompleteEnrollmentAdapter({ config, createClient, hmacSha256 });

    await expect(built.authenticate('Bearer verified-jwt')).resolves.toEqual({
      userId: 'user-1',
      phone: '+8613800138000',
    });
    await expect(built.complete({
      requestId: 'request-1',
      userId: 'user-1',
      phone: '+8613800138000',
    })).resolves.toEqual({ cohortId: 'cohort-1' });

    expect(createClient).toHaveBeenNthCalledWith(1, config.supabaseUrl, config.anonKey, {
      global: { headers: { Authorization: 'Bearer verified-jwt' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(caller.auth.getUser).toHaveBeenCalledWith('verified-jwt');
    expect(createClient).toHaveBeenNthCalledWith(2, config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(hmacSha256).toHaveBeenCalledWith('+8613800138000', config.phoneHmacSecret);
    expect(admin.rpc).toHaveBeenCalledWith('complete_enrollment', {
      p_request_id: 'request-1',
      p_user_id: 'user-1',
      p_phone_hmac: 'phone-hmac',
    });
  });

  it('rejects an auth user without a valid Chinese mobile before HMAC or RPC', async () => {
    const caller = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', phone: 'not-a-phone' } },
          error: null,
        }),
      },
    };
    const createClient = vi.fn().mockReturnValue(caller);
    const hmacSha256 = vi.fn();
    const built = createCompleteEnrollmentAdapter({ config, createClient, hmacSha256 });

    await expect(built.authenticate('Bearer verified-jwt')).resolves.toBeNull();
    expect(hmacSha256).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../lib/supabase/client';
import { verifyAndJoin } from './authService';

vi.mock('../../lib/supabase/client', () => ({
  getSupabaseClient: vi.fn(),
}));

function client(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            phone: '+8613800138000',
            phone_confirmed_at: '2026-07-22T00:00:00Z',
          },
        },
        error: null,
      }),
      verifyOtp: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'verified-access-token',
            user: {
              id: 'user-1',
              phone: '+8613800138000',
              phone_confirmed_at: '2026-07-22T00:00:00Z',
            },
          },
          user: { id: 'user-1', phone: '+8613800138000', phone_confirmed_at: '2026-07-22T00:00:00Z' },
        },
        error: null,
      }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { cohortId: 'cohort-1' }, error: null }),
    },
    ...overrides,
  };
}

describe('verifyAndJoin', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset();
  });

  it('skips OTP consumption when a verified session already matches the input phone', async () => {
    const supabase = client();
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-1',
            phone: '+8613800138000',
            phone_confirmed_at: '2026-07-22T00:00:00Z',
          },
          access_token: 'verified-access-token',
        },
      },
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    await expect(verifyAndJoin({
      phone: '+8613800138000',
      token: '123456',
      requestId: 'request-1',
    })).resolves.toEqual({ cohortId: 'cohort-1' });

    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
    expect(supabase.auth.getUser).toHaveBeenCalledWith('verified-access-token');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('complete-enrollment', {
      body: { requestId: 'request-1' },
      headers: { Authorization: 'Bearer verified-access-token' },
    });
  });

  it('consumes OTP when the current session belongs to a different phone', async () => {
    const supabase = client();
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-2',
            phone: '+8613900139000',
            phone_confirmed_at: '2026-07-22T00:00:00Z',
          },
        },
      },
      error: null,
    });
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    await verifyAndJoin({
      phone: '+8613800138000',
      token: '123456',
      requestId: 'request-1',
    });

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      phone: '+8613800138000',
      token: '123456',
      type: 'sms',
    });
  });

  it('does not trust a matching local session when server user validation fails', async () => {
    const supabase = client();
    supabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-1',
            phone: '+8613800138000',
            phone_confirmed_at: '2026-07-22T00:00:00Z',
          },
          access_token: 'tampered-local-token',
        },
      },
      error: null,
    });
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('invalid token'),
    });
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    await verifyAndJoin({
      phone: '+8613800138000',
      token: '123456',
      requestId: 'request-1',
    });

    expect(supabase.auth.getUser).toHaveBeenCalledWith('tampered-local-token');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('maps completion errors to enrollment_failed after phone verification', async () => {
    const supabase = client();
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response('provider secret +8613800138000') },
    });
    vi.mocked(getSupabaseClient).mockReturnValue(supabase as never);

    await expect(verifyAndJoin({
      phone: '+8613800138000',
      token: '123456',
      requestId: 'request-1',
    })).rejects.toThrow('enrollment_failed');
  });
});

import { getSupabaseClient } from '../../lib/supabase/client';
import type { RequestInviteOtpInput, RequestInviteOtpResult, VerifyAndJoinInput } from './types';
import { normalizeChineseMobile } from './phone';

async function functionErrorCode(error: unknown): Promise<string> {
  if (typeof error !== 'object' || error === null || !('context' in error)) return 'request_failed';
  const context = error.context;
  if (!(context instanceof Response)) return 'request_failed';

  try {
    const body = await context.clone().json() as { error?: unknown };
    return typeof body.error === 'string' ? body.error : 'request_failed';
  } catch {
    return 'request_failed';
  }
}

export async function requestInviteOtp(input: RequestInviteOtpInput): Promise<RequestInviteOtpResult> {
  const { data, error } = await getSupabaseClient().functions.invoke<RequestInviteOtpResult>(
    'request-invite-otp',
    { body: input },
  );
  if (error) throw new Error(await functionErrorCode(error));
  if (!data) throw new Error('request_failed');
  return data;
}

export async function verifyAndJoin(input: VerifyAndJoinInput): Promise<{ cohortId: string }> {
  const supabase = getSupabaseClient();
  let accessToken: string | null = null;
  let candidateToken: string | null = null;

  try {
    const { data, error } = await supabase.auth.getSession();
    candidateToken = !error ? (data.session?.access_token ?? null) : null;
  } catch {
    // A missing local session is expected on the first verification attempt.
  }

  if (candidateToken) {
    try {
      const verified = await supabase.auth.getUser(candidateToken);
      if (verified.error) throw new Error('enrollment_failed');
      const verifiedPhone = verified.data.user?.phone
        ? normalizeChineseMobile(verified.data.user.phone)
        : null;
      if (
        verifiedPhone === input.phone
        && verified.data.user?.phone_confirmed_at
      ) {
        accessToken = candidateToken;
      }
    } catch {
      throw new Error('enrollment_failed');
    }
  }

  if (!accessToken) {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: input.phone,
      token: input.token,
      type: 'sms',
    });
    if (error || !data.session?.access_token) throw new Error('verification_failed');
    accessToken = data.session.access_token;
  }

  const result = await supabase.functions.invoke<{ cohortId: string }>('complete-enrollment', {
    body: { requestId: input.requestId },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (result.error) throw new Error('enrollment_failed');
  if (!result.data) throw new Error('enrollment_failed');
  return result.data;
}

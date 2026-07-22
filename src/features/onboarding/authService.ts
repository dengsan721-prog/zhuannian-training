import { getSupabaseClient } from '../../lib/supabase/client';
import type { RequestInviteOtpInput, RequestInviteOtpResult, VerifyAndJoinInput } from './types';

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
  const { error } = await supabase.auth.verifyOtp({
    phone: input.phone,
    token: input.token,
    type: 'sms',
  });
  if (error) throw new Error('verification_failed');

  const result = await supabase.functions.invoke<{ cohortId: string }>('complete-enrollment', {
    body: { requestId: input.requestId },
  });
  if (result.error) throw new Error(await functionErrorCode(result.error));
  if (!result.data) throw new Error('enrollment_failed');
  return result.data;
}

export interface RequestInviteOtpInput {
  phone: string;
  inviteCode: string;
  adultAttested: true;
  privacyConsentVersion: string;
  serviceBoundaryVersion: string;
}

export interface RequestInviteOtpResult {
  accepted: true;
  requestId: string;
  retryAfterSeconds: number;
}

export interface VerifyAndJoinInput {
  phone: string;
  token: string;
  requestId: string;
}

import { useState, type FormEvent } from 'react';
import { requestInviteOtp } from './authService';
import { normalizeChineseMobile } from './phone';
import type { RequestInviteOtpInput, RequestInviteOtpResult } from './types';

const CONSENT_VERSION = '2026-07-22';
const SESSION_KEY = 'zhuannian:onboarding';

type RequestSms = (input: RequestInviteOtpInput) => Promise<RequestInviteOtpResult>;

interface JoinCohortPageProps {
  requestSms?: RequestSms;
}

export function JoinCohortPage({ requestSms = requestInviteOtp }: JoinCohortPageProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [phone, setPhone] = useState('');
  const [adultAttested, setAdultAttested] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [boundaryAccepted, setBoundaryAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedPhone = normalizeChineseMobile(phone);
  const normalizedInvite = inviteCode.trim().toUpperCase();
  const inviteIsValid = /^[A-Z0-9]{6,64}$/.test(normalizedInvite);
  const canSubmit = Boolean(
    normalizedPhone && inviteIsValid && adultAttested && privacyAccepted && boundaryAccepted && !pending,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !normalizedPhone) return;

    setPending(true);
    setError(null);
    try {
      const result = await requestSms({
        phone: normalizedPhone,
        inviteCode: normalizedInvite,
        adultAttested: true,
        privacyConsentVersion: CONSENT_VERSION,
        serviceBoundaryVersion: CONSENT_VERSION,
      });
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        phone: normalizedPhone,
        requestId: result.requestId,
      }));
      setRequested(true);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === 'invite_invalid_or_expired'
          ? '邀请已失效，请联系教练重新获取'
          : '验证码暂时无法发送，请稍后重试',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="surface onboarding-stack" aria-labelledby="join-title">
        <p className="eyebrow">成年人邀请入班</p>
        <h1 id="join-title">验证班级邀请</h1>
        <form className="onboarding-stack" onSubmit={submit}>
          <label>
            班级码
            <input
              name="inviteCode"
              autoComplete="off"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
            />
          </label>
          <label>
            手机号
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={adultAttested}
              onChange={(event) => setAdultAttested(event.target.checked)}
            />
            我已年满18周岁
          </label>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(event) => setPrivacyAccepted(event.target.checked)}
            />
            我同意隐私说明
          </label>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={boundaryAccepted}
              onChange={(event) => setBoundaryAccepted(event.target.checked)}
            />
            我已阅读服务边界
          </label>
          <button className="primary-action" type="submit" disabled={!canSubmit}>
            {pending ? '正在发送…' : '发送验证码'}
          </button>
        </form>

        {error && <p role="alert" className="error-note">{error}</p>}
        {requested && (
          <p role="status">
            验证码请求已受理。<a href="/verify">输入验证码</a>
          </p>
        )}

        <div className="service-disclosure">
          <p>Supabase 负责身份验证和数据库。</p>
          <p>当前尚未配置生产短信供应商或第三方监控服务；真实短信仍是部署前置条件。</p>
          <p className="boundary-note">本服务不是急救或危机热线</p>
          <p><a href="/privacy">隐私说明</a> · <a href="/content-correction">内容纠错</a></p>
        </div>
      </section>
    </main>
  );
}

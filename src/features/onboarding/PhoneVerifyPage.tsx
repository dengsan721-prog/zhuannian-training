import { useState, type FormEvent } from 'react';
import { verifyAndJoin } from './authService';
import { normalizeChineseMobile } from './phone';
import type { VerifyAndJoinInput } from './types';

const SESSION_KEY = 'zhuannian:onboarding';

type VerifyEnrollment = (input: VerifyAndJoinInput) => Promise<{ cohortId: string }>;

interface PhoneVerifyPageProps {
  phone?: string;
  requestId?: string;
  verifyEnrollment?: VerifyEnrollment;
}

function savedRequest(): { phone: string; requestId: string } | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? 'null') as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('phone' in parsed) || !('requestId' in parsed)) return null;
    if (typeof parsed.phone !== 'string' || typeof parsed.requestId !== 'string') return null;
    const phone = normalizeChineseMobile(parsed.phone);
    return phone && parsed.requestId ? { phone, requestId: parsed.requestId } : null;
  } catch {
    return null;
  }
}

export function PhoneVerifyPage({
  phone,
  requestId,
  verifyEnrollment = verifyAndJoin,
}: PhoneVerifyPageProps) {
  const [stored] = useState(savedRequest);
  const canonicalPhone = phone ? normalizeChineseMobile(phone) : stored?.phone;
  const activeRequestId = requestId ?? stored?.requestId;
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canonicalPhone || !activeRequestId) {
    return (
      <main className="app-shell">
        <section className="surface onboarding-stack">
          <p role="alert">验证信息已失效，请重新获取验证码</p>
          <a href="/join">返回入班验证</a>
        </section>
      </main>
    );
  }
  const verifiedPhone = canonicalPhone;
  const verifiedRequestId = activeRequestId;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(token) || pending) return;

    setPending(true);
    setError(null);
    try {
      await verifyEnrollment({ phone: verifiedPhone, token, requestId: verifiedRequestId });
      window.sessionStorage.removeItem(SESSION_KEY);
      setJoined(true);
    } catch {
      setError('验证码无效或已过期，请重试');
    } finally {
      setPending(false);
    }
  }

  if (joined) {
    return (
      <main className="app-shell">
        <section className="surface onboarding-stack">
          <h1>已加入班级</h1>
          <a className="primary-action" href="/scenes">进入场景首页</a>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="surface onboarding-stack" aria-labelledby="verify-title">
        <h1 id="verify-title">输入手机验证码</h1>
        <form className="onboarding-stack" onSubmit={submit}>
          <label>
            六位验证码
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button className="primary-action" type="submit" disabled={!/^\d{6}$/.test(token) || pending}>
            {pending ? '正在验证…' : '完成入班'}
          </button>
        </form>
        {error && <p role="alert" className="error-note">{error}</p>}
      </section>
    </main>
  );
}

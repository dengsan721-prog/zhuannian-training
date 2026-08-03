import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinCohortPage } from './JoinCohortPage';

describe('JoinCohortPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('blocks invite submission until adult confirmation', async () => {
    render(<JoinCohortPage requestSms={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('班级码'), 'ABC123');
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeDisabled();
  });

  it('requests SMS only after invitation, privacy and adult confirmation', async () => {
    const requestSms = vi.fn().mockResolvedValue({ accepted: true, requestId: 'request-1', retryAfterSeconds: 60 });
    render(<JoinCohortPage requestSms={requestSms} />);
    await userEvent.type(screen.getByLabelText('班级码'), 'ABC123');
    await userEvent.type(screen.getByLabelText('手机号'), '13800138000');
    await userEvent.click(screen.getByLabelText('我已年满18周岁'));
    await userEvent.click(screen.getByLabelText('我已阅读并同意隐私说明'));
    await userEvent.click(screen.getByLabelText('我已阅读服务边界'));
    await userEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    expect(requestSms).toHaveBeenCalledWith({
      phone: '+8613800138000', inviteCode: 'ABC123', adultAttested: true,
      privacyConsentVersion: '2026-07-22', serviceBoundaryVersion: '2026-07-22',
    });
  });

  it('starts with every consent unchecked and names the real provider state', () => {
    render(<JoinCohortPage requestSms={vi.fn()} />);

    expect(screen.getByLabelText('我已年满18周岁')).not.toBeChecked();
    expect(screen.getByLabelText('我已阅读并同意隐私说明')).not.toBeChecked();
    expect(screen.getByLabelText('我已阅读服务边界')).not.toBeChecked();
    expect(screen.getByText(/Supabase 负责身份验证和数据库/)).toBeInTheDocument();
    expect(screen.getByText(/尚未配置生产短信供应商或第三方监控服务/)).toBeInTheDocument();
    expect(screen.getByText('本服务不是急救或危机热线')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '内容纠错' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '隐私说明' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: '服务边界' })).toHaveAttribute('href', '/service-boundary');
  });

  it('offers a no-class-code demo without submitting personal data', async () => {
    const requestSms = vi.fn();
    render(<JoinCohortPage requestSms={requestSms} />);

    const demoLink = screen.getByRole('link', {
      name: '无需班级码，直接体验',
    });
    demoLink.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(demoLink);

    expect(demoLink).toHaveAttribute('href', '/scenes');
    expect(window.sessionStorage.getItem('zhuannian:demo-mode')).toBe('1');
    expect(requestSms).not.toHaveBeenCalled();
  });

  it('does not turn consent on when a user opens an information link', async () => {
    render(<JoinCohortPage requestSms={vi.fn()} />);
    const privacyConsent = screen.getByLabelText('我已阅读并同意隐私说明');
    const boundaryConsent = screen.getByLabelText('我已阅读服务边界');
    const privacyLink = screen.getByRole('link', { name: '隐私说明' });
    const boundaryLink = screen.getByRole('link', { name: '服务边界' });
    privacyLink.addEventListener('click', (event) => event.preventDefault());
    boundaryLink.addEventListener('click', (event) => event.preventDefault());

    await userEvent.click(privacyLink);
    await userEvent.click(boundaryLink);

    expect(privacyConsent).not.toBeChecked();
    expect(boundaryConsent).not.toBeChecked();
  });

  it('keeps submission disabled for a malformed phone', async () => {
    render(<JoinCohortPage requestSms={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('班级码'), 'ABC123');
    await userEvent.type(screen.getByLabelText('手机号'), '12800138000');
    await userEvent.click(screen.getByLabelText('我已年满18周岁'));
    await userEvent.click(screen.getByLabelText('我已阅读并同意隐私说明'));
    await userEvent.click(screen.getByLabelText('我已阅读服务边界'));

    expect(screen.getByRole('button', { name: '发送验证码' })).toBeDisabled();
  });

  it('keeps the normalized phone and request id for verification', async () => {
    const requestSms = vi.fn().mockResolvedValue({ accepted: true, requestId: 'request-1', retryAfterSeconds: 60 });
    render(<JoinCohortPage requestSms={requestSms} />);
    await userEvent.type(screen.getByLabelText('班级码'), 'ABC123');
    await userEvent.type(screen.getByLabelText('手机号'), '+86 138 0013 8000');
    await userEvent.click(screen.getByLabelText('我已年满18周岁'));
    await userEvent.click(screen.getByLabelText('我已阅读并同意隐私说明'));
    await userEvent.click(screen.getByLabelText('我已阅读服务边界'));
    await userEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    await waitFor(() => expect(screen.getByRole('link', { name: '输入验证码' })).toHaveAttribute('href', '/verify'));
    expect(JSON.parse(window.sessionStorage.getItem('zhuannian:onboarding') ?? '{}')).toEqual({
      phone: '+8613800138000',
      requestId: 'request-1',
    });
  });

  it('uses the same message for an invalid or expired invite', async () => {
    const requestSms = vi.fn().mockRejectedValue(new Error('invite_invalid_or_expired'));
    render(<JoinCohortPage requestSms={requestSms} />);
    await userEvent.type(screen.getByLabelText('班级码'), 'ABC123');
    await userEvent.type(screen.getByLabelText('手机号'), '13800138000');
    await userEvent.click(screen.getByLabelText('我已年满18周岁'));
    await userEvent.click(screen.getByLabelText('我已阅读并同意隐私说明'));
    await userEvent.click(screen.getByLabelText('我已阅读服务边界'));
    await userEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('邀请已失效，请联系教练重新获取');
  });

  it('clears an old request and link before a new OTP request that fails', async () => {
    const requestSms = vi.fn()
      .mockResolvedValueOnce({ accepted: true, requestId: 'request-old', retryAfterSeconds: 60 })
      .mockRejectedValueOnce(new Error('request_failed'));
    render(<JoinCohortPage requestSms={requestSms} />);
    await userEvent.type(screen.getByLabelText('班级码'), 'ABC123');
    await userEvent.type(screen.getByLabelText('手机号'), '13800138000');
    await userEvent.click(screen.getByLabelText('我已年满18周岁'));
    await userEvent.click(screen.getByLabelText('我已阅读并同意隐私说明'));
    await userEvent.click(screen.getByLabelText('我已阅读服务边界'));
    await userEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    expect(await screen.findByRole('link', { name: '输入验证码' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('验证码暂时无法发送，请稍后重试');
    expect(screen.queryByRole('link', { name: '输入验证码' })).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('zhuannian:onboarding')).toBeNull();
  });
});

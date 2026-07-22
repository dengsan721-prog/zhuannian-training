import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneVerifyPage } from './PhoneVerifyPage';

describe('PhoneVerifyPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('submits exactly six digits with the same phone and request id', async () => {
    const verifyEnrollment = vi.fn().mockResolvedValue({ cohortId: 'cohort-1' });
    render(
      <PhoneVerifyPage
        phone="+8613800138000"
        requestId="request-1"
        verifyEnrollment={verifyEnrollment}
      />,
    );

    const submit = screen.getByRole('button', { name: '完成入班' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('六位验证码'), '123456');
    await userEvent.click(submit);

    expect(verifyEnrollment).toHaveBeenCalledWith({
      phone: '+8613800138000',
      token: '123456',
      requestId: 'request-1',
    });
    expect(await screen.findByText('已加入班级')).toBeInTheDocument();
  });

  it('does not submit letters or fewer than six digits', async () => {
    const verifyEnrollment = vi.fn();
    render(
      <PhoneVerifyPage
        phone="+8613800138000"
        requestId="request-1"
        verifyEnrollment={verifyEnrollment}
      />,
    );

    await userEvent.type(screen.getByLabelText('六位验证码'), '12a45');
    expect(screen.getByRole('button', { name: '完成入班' })).toBeDisabled();
    expect(verifyEnrollment).not.toHaveBeenCalled();
  });

  it('reads the phone and request id saved by the join flow', async () => {
    window.sessionStorage.setItem('zhuannian:onboarding', JSON.stringify({
      phone: '+8613800138000',
      requestId: 'request-1',
    }));
    const verifyEnrollment = vi.fn().mockResolvedValue({ cohortId: 'cohort-1' });
    render(<PhoneVerifyPage verifyEnrollment={verifyEnrollment} />);

    await userEvent.type(screen.getByLabelText('六位验证码'), '654321');
    await userEvent.click(screen.getByRole('button', { name: '完成入班' }));

    await waitFor(() => expect(verifyEnrollment).toHaveBeenCalledWith({
      phone: '+8613800138000',
      token: '654321',
      requestId: 'request-1',
    }));
    expect(await screen.findByText('已加入班级')).toBeInTheDocument();
  });

  it('rejects verification without a valid join flow', () => {
    render(<PhoneVerifyPage verifyEnrollment={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('验证信息已失效，请重新获取验证码');
    expect(screen.queryByRole('button', { name: '完成入班' })).not.toBeInTheDocument();
  });
});

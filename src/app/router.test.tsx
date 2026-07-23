import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppRouter } from './router';

function renderRoute(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  );
}

describe('onboarding information routes', () => {
  afterEach(cleanup);

  it('renders the versioned privacy notice at /privacy', () => {
    renderRoute('/privacy');

    expect(screen.getByRole('heading', { name: '隐私说明' })).toBeInTheDocument();
    expect(screen.getByText('版本：2026-07-22')).toBeInTheDocument();
    expect(screen.getByText(/Supabase 用于身份验证和数据库/)).toBeInTheDocument();
    expect(screen.getByText(/收集手机号、手机号哈希、同意记录和班级成员关系/)).toBeInTheDocument();
    expect(screen.getByText(/尚未配置生产短信供应商或第三方监控服务/)).toBeInTheDocument();
    expect(screen.getByText(/真实短信能力仍是部署前置条件/)).toBeInTheDocument();
  });

  it('renders the adult and high-risk stop boundary at /service-boundary', () => {
    renderRoute('/service-boundary');

    expect(screen.getByRole('heading', { name: '服务边界' })).toBeInTheDocument();
    expect(screen.getByText(/仅面向成年人/)).toBeInTheDocument();
    expect(screen.getByText(/不是急救或危机热线/)).toBeInTheDocument();
    expect(screen.getByText(/不提供诊断或治疗/)).toBeInTheDocument();
    expect(screen.getByText(/高风险情形应停止转念训练并立即寻求现实帮助/)).toBeInTheDocument();
  });

  it('renders only currently available correction channels at /content-correction', () => {
    renderRoute('/content-correction');

    expect(screen.getByRole('heading', { name: '内容纠错' })).toBeInTheDocument();
    expect(screen.getByText(/封闭试用期间，请联系发放班级码的教练/)).toBeInTheDocument();
    expect(screen.getByText(/入班后可使用支持入口/)).toBeInTheDocument();
    expect(screen.getByText(/正式工单功能尚未上线/)).toBeInTheDocument();
  });
});

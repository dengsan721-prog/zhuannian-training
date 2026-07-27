import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { SupportHubPage } from './SupportHubPage';

describe('SupportHubPage', () => {
  afterEach(cleanup);

  it('separates ordinary help and safety with only the three available entries', () => {
    render(
      <MemoryRouter>
        <SupportHubPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '支持与安全' })).toHaveFocus();
    expect(screen.getByText(/普通求助和安全报告是两条独立流程/))
      .toBeInTheDocument();
    expect(screen.getByRole('link', { name: '请求教练帮助' }))
      .toHaveAttribute('href', '/support/request');
    expect(screen.getByRole('link', { name: '创建安全报告' }))
      .toHaveAttribute('href', '/support/safety-report');
    expect(screen.getByRole('link', { name: '查看提交状态' }))
      .toHaveAttribute('href', '/support/status');
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(
      /内容投诉|教练投诉|隐私请求|账户删除|导出/,
    );
  });
});

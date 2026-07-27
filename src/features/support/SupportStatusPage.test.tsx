import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MySafetyReportStatus,
  MySupportTicketStatus,
} from '../../domain/support/types';
import type { SupportRepository } from '../../lib/repositories/SupportRepository';
import { SupportStatusPage } from './SupportStatusPage';

const ticket: MySupportTicketStatus = {
  ticketId: '66666666-6666-4666-8666-666666666666',
  status: 'submitted',
  snapshotShared: true,
  submittedAt: '2026-07-23T08:00:00.000Z',
  firstResponseDueAt: '2026-07-24T08:00:00.000Z',
};
const report: MySafetyReportStatus = {
  reportId: '88888888-8888-4888-8888-888888888888',
  status: 'submitted',
  submittedAt: '2026-07-23T09:00:00.000Z',
};
const otherTicket: MySupportTicketStatus = {
  ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  status: 'submitted',
  snapshotShared: true,
  submittedAt: '2026-07-23T10:00:00.000Z',
  firstResponseDueAt: '2026-07-24T10:00:00.000Z',
};
const revokeRequestId = '99999999-9999-4999-8999-999999999999';

function repositoryWith(
  overrides: Partial<SupportRepository> = {},
): SupportRepository {
  return {
    createSupportTicket: vi.fn(),
    listMySupportTickets: vi.fn(async () => [ticket]),
    revokeSupportConsent: vi.fn(async () => ({
      ticketId: ticket.ticketId,
      status: 'withdrawn' as const,
      snapshotShared: false as const,
    })),
    stopTrainingForSafety: vi.fn(),
    createSafetyReport: vi.fn(),
    listMySafetyReports: vi.fn(async () => [report]),
    ...overrides,
  };
}

function renderPage(repository: SupportRepository, online = true) {
  return render(
    <MemoryRouter>
      <SupportStatusPage repository={repository} online={online} />
    </MemoryRouter>,
  );
}

describe('SupportStatusPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads help and safety sections independently with minimal copy', async () => {
    let resolveTickets!: (value: MySupportTicketStatus[]) => void;
    const tickets = new Promise<MySupportTicketStatus[]>((resolve) => {
      resolveTickets = resolve;
    });
    renderPage(repositoryWith({
      listMySupportTickets: vi.fn(() => tickets),
      listMySafetyReports: vi.fn(async () => [report]),
    }));

    expect(await screen.findByText(report.reportId)).toBeInTheDocument();
    expect(screen.getByText(/安全报告状态不是救援进度/)).toBeInTheDocument();
    expect(screen.getByText(/正在加载求助状态/)).toHaveAttribute(
      'role',
      'status',
    );

    resolveTickets([ticket]);
    expect(await screen.findByText(ticket.ticketId)).toBeInTheDocument();
    expect(screen.getByText('已进入服务队列')).toBeInTheDocument();
    expect(screen.getByText('已分享训练选择')).toBeInTheDocument();
    expect(screen.getByText('已进入安全负责人队列')).toBeInTheDocument();
    expect(screen.getByText(/试点首次响应目标时间/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /补充说明|第一念|假设|教练姓名|负责人姓名|排名|积分|思想正确率|24 小时在线/,
    );
  });

  it('shows independent errors and retries only the failed section', async () => {
    const listMySupportTickets = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([ticket]);
    const listMySafetyReports = vi.fn(async () => [report]);
    const user = userEvent.setup();
    renderPage(repositoryWith({
      listMySupportTickets,
      listMySafetyReports,
    }));

    expect(await screen.findByText(report.reportId)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '当前无法确认求助状态',
    );
    await user.click(screen.getByRole('button', { name: '重试加载求助状态' }));

    expect(await screen.findByText(ticket.ticketId)).toBeInTheDocument();
    expect(listMySupportTickets).toHaveBeenCalledTimes(2);
    expect(listMySafetyReports).toHaveBeenCalledTimes(1);
  });

  it('freezes a revocation request after an unknown response and updates withdrawn state', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(revokeRequestId);
    const revokeSupportConsent = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        ticketId: ticket.ticketId,
        status: 'withdrawn',
        snapshotShared: false,
      });
    const user = userEvent.setup();
    renderPage(repositoryWith({ revokeSupportConsent }));

    const revoke = await screen.findByRole('button', {
      name: '撤回共享并停止这次求助',
    });
    await user.click(revoke);
    expect(screen.getByText(/共享快照和补充说明会被删除/)).toBeInTheDocument();
    expect(screen.getByText(/普通求助会变为已撤回/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {
      name: '确认撤回共享并停止这次求助',
    }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '撤回结果尚无法确认',
    );
    await user.click(screen.getByRole('button', { name: '重试撤回确认' }));
    expect(revokeSupportConsent).toHaveBeenCalledTimes(2);
    expect(revokeSupportConsent.mock.calls[0]).toEqual(
      revokeSupportConsent.mock.calls[1],
    );
    expect(revokeSupportConsent).toHaveBeenCalledWith({
      ticketId: ticket.ticketId,
      requestId: revokeRequestId,
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', {
        name: '撤回共享并停止这次求助',
      })).not.toBeInTheDocument();
    });
    expect(screen.getByText('已撤回')).toBeInTheDocument();
    expect(screen.getByText('已撤回并删除共享内容')).toBeInTheDocument();
    expect(screen.queryByText(/试点首次响应目标时间/))
      .not.toBeInTheDocument();
  });

  it('does not fetch or display cached estimates while offline', () => {
    const repository = repositoryWith();
    renderPage(repository, false);

    expect(screen.getAllByText(/离线，当前状态无法确认/)).toHaveLength(2);
    expect(repository.listMySupportTickets).not.toHaveBeenCalled();
    expect(repository.listMySafetyReports).not.toHaveBeenCalled();
    expect(screen.queryByText(ticket.ticketId)).not.toBeInTheDocument();
    expect(screen.queryByText(report.reportId)).not.toBeInTheDocument();
  });

  it('uses a synchronous in-flight lock for repeated revocation clicks', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(revokeRequestId);
    let resolveRevoke!: (value: {
      ticketId: string;
      status: 'withdrawn';
      snapshotShared: false;
    }) => void;
    const pending = new Promise<{
      ticketId: string;
      status: 'withdrawn';
      snapshotShared: false;
    }>((resolve) => {
      resolveRevoke = resolve;
    });
    const revokeSupportConsent = vi.fn(() => pending);
    const user = userEvent.setup();
    renderPage(repositoryWith({ revokeSupportConsent }));

    await user.click(await screen.findByRole('button', {
      name: '撤回共享并停止这次求助',
    }));
    const confirm = screen.getByRole('button', {
      name: '确认撤回共享并停止这次求助',
    });
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(revokeSupportConsent).toHaveBeenCalledTimes(1);
    expect(revokeSupportConsent).toHaveBeenCalledWith({
      ticketId: ticket.ticketId,
      requestId: revokeRequestId,
    });

    resolveRevoke({
      ticketId: ticket.ticketId,
      status: 'withdrawn',
      snapshotShared: false,
    });
    expect(await screen.findByText('已撤回')).toBeInTheDocument();
  });

  it('does not freeze revocation after a stable rejected request', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce(revokeRequestId)
      .mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const revokeSupportConsent = vi.fn()
      .mockRejectedValueOnce(new Error('support_ticket_not_found'))
      .mockResolvedValueOnce({
        ticketId: ticket.ticketId,
        status: 'withdrawn',
        snapshotShared: false,
      });
    const user = userEvent.setup();
    renderPage(repositoryWith({ revokeSupportConsent }));

    await user.click(await screen.findByRole('button', {
      name: '撤回共享并停止这次求助',
    }));
    await user.click(screen.getByRole('button', {
      name: '确认撤回共享并停止这次求助',
    }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '最新状态需重新加载',
    );
    expect(screen.queryByRole('button', {
      name: '重试撤回确认',
    })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {
      name: '确认撤回共享并停止这次求助',
    }));
    expect(revokeSupportConsent.mock.calls[0][0].requestId)
      .not.toBe(revokeSupportConsent.mock.calls[1][0].requestId);
  });

  it.each([
    ['withdrawn', [{
      ...ticket,
      status: 'withdrawn' as const,
      snapshotShared: false,
    }, otherTicket]],
    ['missing', [otherTicket]],
  ] as const)(
    'clears an unknown revoke lock when authoritative reload shows the target %s',
    async (_state, authoritativeTickets) => {
      vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
        revokeRequestId,
      );
      const listMySupportTickets = vi.fn()
        .mockResolvedValueOnce([ticket, otherTicket])
        .mockResolvedValueOnce(authoritativeTickets);
      const revokeSupportConsent = vi.fn().mockRejectedValue(
        new Error('response lost'),
      );
      const user = userEvent.setup();
      renderPage(repositoryWith({
        listMySupportTickets,
        revokeSupportConsent,
      }));

      const revokeButtons = await screen.findAllByRole('button', {
        name: '撤回共享并停止这次求助',
      });
      await user.click(revokeButtons[0]);
      await user.click(screen.getByRole('button', {
        name: '确认撤回共享并停止这次求助',
      }));
      expect(await screen.findByRole('button', {
        name: '重试撤回确认',
      })).toBeInTheDocument();

      await user.click(screen.getByRole('button', {
        name: '重新加载求助状态',
      }));
      await waitFor(() => {
        expect(listMySupportTickets).toHaveBeenCalledTimes(2);
      });
      expect(screen.queryByRole('button', {
        name: '重试撤回确认',
      })).not.toBeInTheDocument();
      expect(screen.getByRole('button', {
        name: '撤回共享并停止这次求助',
      })).toBeEnabled();
    },
  );
});

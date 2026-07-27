import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SafetySignalCode } from '../../domain/training/types';
import type { SupportRepository } from '../../lib/repositories/SupportRepository';
import { baseTrainingDraft } from '../../test/fixtures/training';
import {
  loadSafetyContext,
  saveSafetyContext,
  trainingDraftStore,
} from '../training/trainingDraftStore';
import { SafetyReportPage } from './SafetyReportPage';

const requestId = '77777777-7777-4777-8777-777777777777';
const reportId = '88888888-8888-4888-8888-888888888888';

function repositoryWith(
  createSafetyReport: SupportRepository['createSafetyReport'] = vi.fn(
    async () => ({
      reportId,
      created: true,
      status: 'submitted' as const,
    }),
  ),
): SupportRepository {
  return {
    createSupportTicket: vi.fn(),
    listMySupportTickets: vi.fn(async () => []),
    revokeSupportConsent: vi.fn(),
    stopTrainingForSafety: vi.fn(),
    createSafetyReport,
    listMySafetyReports: vi.fn(async () => []),
  };
}

function renderPage(
  repository: SupportRepository,
  options: {
    sessionId?: string;
    context?: {
      sceneVersionId: string;
      source: 'server';
    } | {
      sceneVersionId: string;
      source: 'user';
      signalCode: SafetySignalCode;
    };
    online?: boolean;
  } = {},
) {
  return render(
    <MemoryRouter>
      <SafetyReportPage
        repository={repository}
        ownerUserId={baseTrainingDraft().userId}
        sessionId={options.sessionId}
        context={options.context}
        online={options.online ?? true}
      />
    </MemoryRouter>,
  );
}

describe('SafetyReportPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    trainingDraftStore.removeAllFromMemory();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requires one of eight generic categories and a separate unchecked confirmation', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const createSafetyReport = vi.fn<
      SupportRepository['createSafetyReport']
    >(async () => ({
      reportId,
      created: true,
      status: 'submitted' as const,
    }));
    const user = userEvent.setup();
    renderPage(repositoryWith(createSafetyReport));

    expect(screen.getByRole('heading', { name: '创建安全报告' })).toHaveFocus();
    const categories = screen.getAllByRole('radio');
    expect(categories).toHaveLength(8);
    for (const category of categories) {
      expect(category).not.toBeChecked();
    }
    expect(screen.getByText(/服务班级仅在能够唯一证明时由服务器关联/))
      .toBeInTheDocument();
    expect(screen.getByText(/提交时间由服务器记录/)).toBeInTheDocument();
    expect(screen.getByText(/不关联训练会话或场景版本/)).toBeInTheDocument();
    expect(screen.getByText(
      /不会提交训练答案、第一念、假设、反馈、补充说明或儿童身份信息/,
    )).toBeInTheDocument();
    expect(screen.getByText(
      /普通教练看不到风险类别\/场景关联\/处理记录/,
    )).toBeInTheDocument();
    const confirmation = screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    });
    expect(confirmation).not.toBeChecked();
    expect(screen.queryByText(/优先级|立即响应|紧急通道/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认提交安全报告' }));
    expect(createSafetyReport).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('请选择最接近的风险类别');
    expect(categories[0]).toHaveFocus();

    await user.click(screen.getByRole('radio', { name: '严重威胁' }));
    await user.click(screen.getByRole('button', { name: '确认提交安全报告' }));
    expect(createSafetyReport).not.toHaveBeenCalled();
    expect(confirmation).toHaveFocus();

    await user.click(confirmation);
    await user.click(screen.getByRole('button', { name: '确认提交安全报告' }));
    expect(createSafetyReport).toHaveBeenCalledWith({
      requestId,
      confirmedByUser: true,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      '安全报告已进入安全负责人队列。',
    );
    expect(screen.getByText(/不表示已有人查看/)).toBeInTheDocument();
    expect(screen.getByText(/不表示已安排报警、救援或即时响应/))
      .toBeInTheDocument();
  });

  it('renders and sends a server session context without inventing a signal', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const draft = baseTrainingDraft();
    const createSafetyReport = vi.fn<
      SupportRepository['createSafetyReport']
    >(async () => ({
      reportId,
      created: true,
      status: 'submitted' as const,
    }));
    const user = userEvent.setup();
    renderPage(repositoryWith(createSafetyReport), {
      sessionId: draft.sessionId,
      context: {
        sceneVersionId: draft.scene.id,
        source: 'server',
      },
    });

    expect(screen.getByText(/账户与服务班级由服务器核对/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(draft.scene.id))).toBeInTheDocument();
    expect(screen.getByText(/提交时间由服务器记录/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /physical_or_sexual_violence|serious_threat|user_declared_danger|用户报告的危险/,
    );

    await user.click(screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    }));
    await user.click(screen.getByRole('button', { name: '确认提交安全报告' }));
    expect(createSafetyReport).toHaveBeenCalledWith({
      requestId,
      confirmedByUser: true,
      sessionId: draft.sessionId,
      context: { source: 'server' },
    });
    expect(JSON.stringify(createSafetyReport.mock.calls[0][0]))
      .not.toContain('signalCode');
  });

  it('clears session context only after confirmed report success', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const draft = baseTrainingDraft();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });
    const createSafetyReport = vi.fn<
      SupportRepository['createSafetyReport']
    >()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        reportId,
        created: false,
        status: 'submitted',
      });
    const user = userEvent.setup();
    renderPage(repositoryWith(createSafetyReport), {
      sessionId: draft.sessionId,
      context: loadSafetyContext(draft.userId, draft.sessionId) ?? undefined,
    });

    expect(loadSafetyContext(draft.userId, draft.sessionId)).not.toBeNull();
    await user.click(screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    }));
    await user.click(screen.getByRole('button', { name: '确认提交安全报告' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '提交结果尚无法确认',
    );
    expect(loadSafetyContext(draft.userId, draft.sessionId)).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '重试确认结果' }));
    expect(createSafetyReport).toHaveBeenCalledTimes(2);
    expect(createSafetyReport.mock.calls[0]).toEqual(
      createSafetyReport.mock.calls[1],
    );
    await waitFor(() => {
      expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    });
  });

  it('retains the owned safety context when leaving from preview', () => {
    const draft = baseTrainingDraft();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    const view = renderPage(repositoryWith(), {
      sessionId: draft.sessionId,
      context: loadSafetyContext(draft.userId, draft.sessionId) ?? undefined,
    });

    expect(screen.getByText(new RegExp(draft.scene.id))).toBeInTheDocument();
    view.unmount();
    expect(loadSafetyContext(draft.userId, draft.sessionId)).not.toBeNull();
  });

  it('does not submit while offline', () => {
    const repository = repositoryWith();
    renderPage(repository, { online: false });

    expect(screen.getByText(/离线状态下尚未提交安全报告/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认提交安全报告' }))
      .toBeDisabled();
    expect(repository.createSafetyReport).not.toHaveBeenCalled();
  });

  it('fails closed for a context without its bound session', () => {
    const repository = repositoryWith();
    renderPage(repository, {
      context: {
        sceneVersionId: baseTrainingDraft().scene.id,
        source: 'server',
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      '安全上下文与训练会话不完整',
    );
    expect(screen.queryByRole('button', {
      name: '确认提交安全报告',
    })).not.toBeInTheDocument();
    expect(repository.createSafetyReport).not.toHaveBeenCalled();
  });

  it('uses a synchronous in-flight lock for repeated report clicks', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    let resolveCreate!: (value: {
      reportId: string;
      created: boolean;
      status: 'submitted';
    }) => void;
    const pending = new Promise<{
      reportId: string;
      created: boolean;
      status: 'submitted';
    }>((resolve) => {
      resolveCreate = resolve;
    });
    const createSafetyReport = vi.fn<
      SupportRepository['createSafetyReport']
    >(() => pending);
    const user = userEvent.setup();
    renderPage(repositoryWith(createSafetyReport));

    await user.click(screen.getByRole('radio', { name: '严重威胁' }));
    await user.click(screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    }));
    const submit = screen.getByRole('button', {
      name: '确认提交安全报告',
    });
    act(() => {
      submit.click();
      submit.click();
    });
    expect(createSafetyReport).toHaveBeenCalledTimes(1);
    expect(createSafetyReport.mock.calls[0][0].requestId).toBe(requestId);

    resolveCreate({ reportId, created: true, status: 'submitted' });
    expect(await screen.findByText(/安全报告已进入安全负责人队列/))
      .toBeInTheDocument();
  });

  it('keeps report controls editable after a stable rejected request', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce(requestId)
      .mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const createSafetyReport = vi.fn<
      SupportRepository['createSafetyReport']
    >()
      .mockRejectedValueOnce(new Error('safety_source_unavailable'))
      .mockResolvedValueOnce({
        reportId,
        created: true,
        status: 'submitted',
      });
    const user = userEvent.setup();
    renderPage(repositoryWith(createSafetyReport));

    const category = screen.getByRole('radio', { name: '严重威胁' });
    const confirmation = screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    });
    await user.click(category);
    await user.click(confirmation);
    await user.click(screen.getByRole('button', {
      name: '确认提交安全报告',
    }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本次明确未提交',
    );
    expect(category).toBeEnabled();
    expect(confirmation).toBeEnabled();
    expect(screen.queryByRole('button', {
      name: '重试确认结果',
    })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {
      name: '确认提交安全报告',
    }));
    expect(createSafetyReport.mock.calls[0][0].requestId)
      .not.toBe(createSafetyReport.mock.calls[1][0].requestId);
  });

  it('offers an explicit generic-report route after a rejected session source', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const draft = baseTrainingDraft();
    const createSafetyReport = vi.fn<
      SupportRepository['createSafetyReport']
    >().mockRejectedValue(new Error('safety_source_unavailable'));
    const user = userEvent.setup();
    renderPage(repositoryWith(createSafetyReport), {
      sessionId: draft.sessionId,
      context: {
        sceneVersionId: draft.scene.id,
        source: 'server',
      },
    });

    await user.click(screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    }));
    await user.click(screen.getByRole('button', {
      name: '确认提交安全报告',
    }));

    expect(await screen.findByRole('link', {
      name: '创建不带训练会话的安全报告',
    })).toHaveAttribute('href', '/support/safety-report');
    expect(screen.getByText(/如果危险仍在/)).toBeInTheDocument();
  });

  it('refocuses the first category after the same validation fails twice', async () => {
    const user = userEvent.setup();
    renderPage(repositoryWith());
    const submit = screen.getByRole('button', {
      name: '确认提交安全报告',
    });
    const firstCategory = screen.getAllByRole('radio')[0];

    await user.click(submit);
    expect(firstCategory).toHaveFocus();
    screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    }).focus();
    await user.click(submit);
    expect(firstCategory).toHaveFocus();
  });

  it('keeps confirmed success visible if its consumed handoff later becomes invalid', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const draft = baseTrainingDraft();
    const repository = repositoryWith();
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <SafetyReportPage
          repository={repository}
          ownerUserId={draft.userId}
          sessionId={draft.sessionId}
          context={{
            sceneVersionId: draft.scene.id,
            source: 'server',
          }}
          online
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    }));
    await user.click(screen.getByRole('button', {
      name: '确认提交安全报告',
    }));
    expect(await screen.findByText('安全报告已进入安全负责人队列。'))
      .toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <SafetyReportPage
          repository={repository}
          ownerUserId={draft.userId}
          sessionId={draft.sessionId}
          online
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('安全报告已进入安全负责人队列。'))
      .toBeInTheDocument();
    expect(screen.queryByText(/安全上下文与训练会话不完整/))
      .not.toBeInTheDocument();
  });
});

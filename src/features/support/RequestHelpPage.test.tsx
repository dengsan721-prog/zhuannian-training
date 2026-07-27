import { StrictMode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportRepository } from '../../lib/repositories/SupportRepository';
import { completedSupportTrainingDraft } from '../../test/fixtures/support';
import { completedTrainingDraft } from '../../test/fixtures/training';
import {
  buildCurrentTrainingSupportIntent,
  currentTrainingSupportIntent,
} from './currentTrainingSupportIntent';
import { RequestHelpPage } from './RequestHelpPage';

const completionId = '55555555-5555-4555-8555-555555555555';
const ticketId = '66666666-6666-4666-8666-666666666666';
const requestId = '77777777-7777-4777-8777-777777777777';

function repositoryWith(
  createSupportTicket: SupportRepository['createSupportTicket'] = vi.fn(
    async () => ({
      ticketId,
      created: true,
      status: 'submitted' as const,
      snapshotShared: false,
    }),
  ),
): SupportRepository {
  return {
    createSupportTicket,
    listMySupportTickets: vi.fn(async () => []),
    revokeSupportConsent: vi.fn(),
    stopTrainingForSafety: vi.fn(),
    createSafetyReport: vi.fn(),
    listMySafetyReports: vi.fn(async () => []),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current path">{location.pathname}</output>;
}

function renderPage(
  repository: SupportRepository,
  ownerUserId = completedTrainingDraft().userId,
  options: { strict?: boolean; online?: boolean } = {},
) {
  const page = (
    <MemoryRouter initialEntries={['/support/request']}>
      <RequestHelpPage
        repository={repository}
        ownerUserId={ownerUserId}
        online={options.online ?? true}
      />
      <LocationProbe />
    </MemoryRouter>
  );
  return render(options.strict ? <StrictMode>{page}</StrictMode> : page);
}

describe('RequestHelpPage', () => {
  beforeEach(() => {
    currentTrainingSupportIntent.clearAll();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('defaults every delayed or cleared-memory visit to exact no_snapshot', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const createSupportTicket = vi.fn<
      SupportRepository['createSupportTicket']
    >(async () => ({
      ticketId,
      created: true,
      status: 'submitted' as const,
      snapshotShared: false,
    }));
    const user = userEvent.setup();
    renderPage(repositoryWith(createSupportTicket));

    expect(screen.getByRole('heading', { name: '请求教练帮助' })).toHaveFocus();
    expect(screen.getByText(/不分享训练选择也可以求助/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /同意分享/ }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '不分享提交求助' }));

    expect(createSupportTicket).toHaveBeenCalledWith({
      kind: 'no_snapshot',
      requestId,
    });
    expect(Object.keys(createSupportTicket.mock.calls[0][0]).sort())
      .toEqual(['kind', 'requestId']);
    expect(await screen.findByText(/求助已进入服务队列/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /已经通知教练|教练已分配|教练已接收/,
    );
  });

  it('retains one StrictMode-safe live intent and requires visible active consent', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const draft = completedSupportTrainingDraft();
    const intent = buildCurrentTrainingSupportIntent(
      draft.userId,
      completionId,
      draft,
    );
    currentTrainingSupportIntent.set(intent);
    const createSupportTicket = vi.fn<
      SupportRepository['createSupportTicket']
    >(async () => ({
      ticketId,
      created: true,
      status: 'submitted' as const,
      snapshotShared: true,
    }));
    const user = userEvent.setup();
    renderPage(repositoryWith(createSupportTicket), draft.userId, {
      strict: true,
    });

    const share = screen.getByRole('radio', { name: '分享这次训练选择' });
    const noShare = screen.getByRole('radio', {
      name: '不分享训练选择也可以求助',
    });
    expect(noShare).toBeChecked();
    expect(share).not.toBeChecked();
    expect(screen.queryByRole('checkbox', {
      name: /我同意将上面列出的最少必要信息用于这次求助/,
    })).not.toBeInTheDocument();
    expect(screen.queryByText(intent.preview.sceneLabel)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(currentTrainingSupportIntent.peek(draft.userId)).toBeNull();
    });

    await user.click(share);
    expect(screen.getByText(intent.preview.sceneLabel)).toBeInTheDocument();
    expect(screen.getByText(intent.preview.sceneStorageNotice)).toBeInTheDocument();
    expect(screen.getByText(intent.preview.selectedThoughtLabel)).toBeInTheDocument();
    for (const text of intent.preview.selectedHypothesisTexts) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    for (const item of intent.preview.evidence) {
      expect(screen.getByText(item.question)).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }
    expect(screen.getByText(intent.preview.exclusionNotice)).toBeInTheDocument();
    const consent = screen.getByRole('checkbox', {
      name: /我同意将上面列出的最少必要信息用于这次求助/,
    });
    expect(consent).not.toBeChecked();
    await user.click(screen.getByRole('button', {
      name: '同意分享并提交',
    }));
    expect(createSupportTicket).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('请先主动确认共享');
    expect(consent).toHaveFocus();

    await user.click(consent);
    await user.click(screen.getByRole('button', {
      name: '同意分享并提交',
    }));
    expect(createSupportTicket).toHaveBeenCalledWith({
      kind: 'current_training_snapshot',
      requestId,
      consentToShare: true,
      completionId,
      snapshot: intent.snapshot,
    });
    expect(JSON.stringify(createSupportTicket.mock.calls[0][0])).not.toMatch(
      /preview|sceneLabel|predictedResponse|feedback|newExpression|microAction|fallback/,
    );
  });

  it('freezes the normalized request and id after an unknown response', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const createSupportTicket = vi.fn<
      SupportRepository['createSupportTicket']
    >()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        ticketId,
        created: false,
        status: 'submitted',
        snapshotShared: false,
      });
    const user = userEvent.setup();
    renderPage(repositoryWith(createSupportTicket));

    const note = screen.getByRole('textbox', { name: '补充说明（可选）' });
    await user.type(note, '  需要帮忙  ');
    await user.click(screen.getByRole('button', { name: '不分享提交求助' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '提交结果尚无法确认',
    );
    expect(note).toBeDisabled();
    expect(screen.getByText(/不能当作“尚未提交”/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试确认结果' }));

    expect(createSupportTicket).toHaveBeenCalledTimes(2);
    expect(createSupportTicket.mock.calls[0]).toEqual(
      createSupportTicket.mock.calls[1],
    );
    expect(createSupportTicket).toHaveBeenCalledWith({
      kind: 'no_snapshot',
      requestId,
      note: '需要帮忙',
    });
  });

  it('does not call the repository while offline or for an invalid note', async () => {
    const repository = repositoryWith();
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryRouter>
        <RequestHelpPage
          repository={repository}
          ownerUserId={completedTrainingDraft().userId}
          online={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/离线状态下尚未提交/)).toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: '不分享提交求助',
    })).toBeDisabled();
    expect(repository.createSupportTicket).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <RequestHelpPage
          repository={repository}
          ownerUserId={completedTrainingDraft().userId}
          online
        />
      </MemoryRouter>,
    );
    const note = screen.getByRole('textbox', { name: '补充说明（可选）' });
    fireEvent.change(note, { target: { value: '字'.repeat(201) } });
    await user.click(screen.getByRole('button', { name: '不分享提交求助' }));
    expect(repository.createSupportTicket).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('最多 200 个字符');
    expect(note).toHaveFocus();
  });

  it('uses a synchronous in-flight lock for repeated clicks', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    let resolveCreate!: (value: {
      ticketId: string;
      created: boolean;
      status: 'submitted';
      snapshotShared: boolean;
    }) => void;
    const pending = new Promise<{
      ticketId: string;
      created: boolean;
      status: 'submitted';
      snapshotShared: boolean;
    }>((resolve) => {
      resolveCreate = resolve;
    });
    const createSupportTicket = vi.fn<
      SupportRepository['createSupportTicket']
    >(() => pending);
    renderPage(repositoryWith(createSupportTicket));

    const submit = screen.getByRole('button', {
      name: '不分享提交求助',
    });
    act(() => {
      submit.click();
      submit.click();
    });
    expect(createSupportTicket).toHaveBeenCalledTimes(1);
    expect(createSupportTicket).toHaveBeenCalledWith({
      kind: 'no_snapshot',
      requestId,
    });

    resolveCreate({
      ticketId,
      created: true,
      status: 'submitted',
      snapshotShared: false,
    });
    expect(await screen.findByText(/未分享训练选择/)).toBeInTheDocument();
  });

  it('does not freeze controls after a stable rejected request', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce(requestId)
      .mockReturnValueOnce('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const createSupportTicket = vi.fn<
      SupportRepository['createSupportTicket']
    >()
      .mockRejectedValueOnce(new Error('active_adult_membership_required'))
      .mockResolvedValueOnce({
        ticketId,
        created: true,
        status: 'submitted',
        snapshotShared: false,
      });
    const user = userEvent.setup();
    renderPage(repositoryWith(createSupportTicket));

    await user.click(screen.getByRole('button', {
      name: '不分享提交求助',
    }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '本次明确未提交',
    );
    expect(screen.getByRole('textbox', {
      name: '补充说明（可选）',
    })).toBeEnabled();
    expect(screen.queryByRole('button', {
      name: '重试确认结果',
    })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {
      name: '不分享提交求助',
    }));
    expect(createSupportTicket.mock.calls[0][0].requestId)
      .not.toBe(createSupportTicket.mock.calls[1][0].requestId);
  });

  it('does not describe an idempotent withdrawn replay as queued', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(requestId);
    const createSupportTicket = vi.fn<
      SupportRepository['createSupportTicket']
    >(async () => ({
      ticketId,
      created: false,
      status: 'withdrawn',
      snapshotShared: false,
    }));
    const user = userEvent.setup();
    renderPage(repositoryWith(createSupportTicket));

    await user.click(screen.getByRole('button', {
      name: '不分享提交求助',
    }));
    const resultCopy = await screen.findByText('这次普通求助已经撤回。');
    const result = resultCopy.closest('[role="status"]');
    expect(result).toHaveTextContent('这次普通求助已经撤回');
    expect(result).not.toHaveTextContent('进入服务队列');
  });

  it.each([
    ['an old success', 'resolve'],
    ['an old unknown result', 'reject'],
  ] as const)(
    'resets all owner-bound state and ignores %s after owner changes',
    async (_label, settlement) => {
      const draft = completedSupportTrainingDraft();
      const nextOwner = '22222222-2222-4222-8222-222222222222';
      let resolveOld!: (value: {
        ticketId: string;
        created: boolean;
        status: 'submitted';
        snapshotShared: boolean;
      }) => void;
      let rejectOld!: (reason: Error) => void;
      const pendingOld = new Promise<{
        ticketId: string;
        created: boolean;
        status: 'submitted';
        snapshotShared: boolean;
      }>((resolve, reject) => {
        resolveOld = resolve;
        rejectOld = reject;
      });
      const createSupportTicket = vi.fn<
        SupportRepository['createSupportTicket']
      >()
        .mockImplementationOnce(() => pendingOld)
        .mockResolvedValueOnce({
          ticketId,
          created: true,
          status: 'submitted',
          snapshotShared: false,
        });
      const intent = buildCurrentTrainingSupportIntent(
        draft.userId,
        completionId,
        draft,
      );
      currentTrainingSupportIntent.set(intent);
      const user = userEvent.setup();
      const { rerender } = render(
        <MemoryRouter>
          <RequestHelpPage
            repository={repositoryWith(createSupportTicket)}
            ownerUserId={draft.userId}
            online
          />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole('radio', {
        name: '分享这次训练选择',
      }));
      await user.click(screen.getByRole('checkbox', {
        name: /我同意将上面列出的最少必要信息用于这次求助/,
      }));
      await user.type(
        screen.getByRole('textbox', { name: '补充说明（可选）' }),
        '只属于旧账户',
      );
      await user.click(screen.getByRole('button', {
        name: '同意分享并提交',
      }));

      rerender(
        <MemoryRouter>
          <RequestHelpPage
            repository={repositoryWith(createSupportTicket)}
            ownerUserId={nextOwner}
            online
          />
        </MemoryRouter>,
      );
      await waitFor(() => {
        expect(screen.getByRole('textbox', {
          name: '补充说明（可选）',
        })).toHaveValue('');
      });
      expect(screen.queryByRole('radio', {
        name: '分享这次训练选择',
      })).not.toBeInTheDocument();
      expect(screen.getByRole('button', {
        name: '不分享提交求助',
      })).toBeEnabled();

      await act(async () => {
        if (settlement === 'resolve') {
          resolveOld({
            ticketId,
            created: true,
            status: 'submitted',
            snapshotShared: true,
          });
        } else {
          rejectOld(new Error('response lost'));
        }
        await pendingOld.catch(() => undefined);
      });
      expect(screen.queryByText(/求助已进入服务队列/))
        .not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', {
        name: '不分享提交求助',
      }));
      expect(createSupportTicket).toHaveBeenCalledTimes(2);
    },
  );

  it('refocuses consent after the same client validation fails twice', async () => {
    const draft = completedSupportTrainingDraft();
    currentTrainingSupportIntent.set(buildCurrentTrainingSupportIntent(
      draft.userId,
      completionId,
      draft,
    ));
    const user = userEvent.setup();
    renderPage(repositoryWith(), draft.userId);

    await user.click(screen.getByRole('radio', {
      name: '分享这次训练选择',
    }));
    const submit = screen.getByRole('button', {
      name: '同意分享并提交',
    });
    const consent = screen.getByRole('checkbox', {
      name: /我同意将上面列出的最少必要信息用于这次求助/,
    });
    await user.click(submit);
    expect(consent).toHaveFocus();

    screen.getByRole('textbox', { name: '补充说明（可选）' }).focus();
    await user.click(submit);
    expect(consent).toHaveFocus();
  });

  it('uses source identifiers rather than repeated preview prose as React keys', async () => {
    const draft = completedSupportTrainingDraft();
    const intent = buildCurrentTrainingSupportIntent(
      draft.userId,
      completionId,
      draft,
    );
    intent.preview.selectedHypothesisTexts[1] =
      intent.preview.selectedHypothesisTexts[0];
    intent.preview.evidence[1].question = intent.preview.evidence[0].question;
    currentTrainingSupportIntent.set(intent);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      // React duplicate-key warnings are the assertion surface.
    });
    const user = userEvent.setup();
    renderPage(repositoryWith(), draft.userId);

    await user.click(screen.getByRole('radio', {
      name: '分享这次训练选择',
    }));
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
      /same key|unique "key"/i,
    );
  });
});

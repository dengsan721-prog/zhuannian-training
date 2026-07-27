import { StrictMode } from 'react';
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
import type { ProgressRepository } from '../lib/repositories/ProgressRepository';
import type { SupportRepository } from '../lib/repositories/SupportRepository';
import type { MySupportTicketStatus } from '../domain/support/types';
import { completedSupportTrainingDraft } from '../test/fixtures/support';
import {
  baseTrainingDraft,
} from '../test/fixtures/training';
import {
  buildCurrentTrainingSupportIntent,
  currentTrainingSupportIntent,
} from '../features/support/currentTrainingSupportIntent';
import {
  loadSafetyContext,
  loadSafetyStopRetryMarker,
  saveSafetyContext,
  saveSafetyStopRetryMarker,
  trainingDraftStore,
} from '../features/training/trainingDraftStore';
import { AppRouter } from './router';

const {
  authStateCallbacks,
  getUserMock,
  onAuthStateChangeMock,
  unsubscribeAuthMock,
} = vi.hoisted(() => {
  type AuthStateCallback = (
    event: string,
    session: { user: { id: string } } | null,
  ) => void;
  const callbacks = new Set<AuthStateCallback>();
  const unsubscribe = vi.fn();
  return {
    authStateCallbacks: callbacks,
    getUserMock: vi.fn(),
    onAuthStateChangeMock: vi.fn((callback: AuthStateCallback) => {
      callbacks.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              callbacks.delete(callback);
              unsubscribe();
            },
          },
        },
      };
    }),
    unsubscribeAuthMock: unsubscribe,
  };
});

vi.mock('../lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: getUserMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  }),
}));

const progressRepository = (): ProgressRepository => ({
  complete: vi.fn(),
  saveReview: vi.fn(),
  setSaved: vi.fn(),
  listSaved: vi.fn(async () => []),
  getPendingReview: vi.fn(async () => null),
  getPrivateProgress: vi.fn(async () => ({
    points: 0,
    completedScenes: 0,
    reviewsCompleted: 0,
    thisWeekCompletions: 0,
    badges: [],
    unlockedSurprises: [],
    classAggregate: null,
  })),
});

function renderRoute(path: string, progress?: ProgressRepository) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter progressRepository={progress} />
    </MemoryRouter>,
  );
}

const supportRepository = (): SupportRepository => ({
  createSupportTicket: vi.fn(),
  listMySupportTickets: vi.fn(async () => []),
  revokeSupportConsent: vi.fn(),
  stopTrainingForSafety: vi.fn(),
  createSafetyReport: vi.fn(),
  listMySafetyReports: vi.fn(async () => []),
});

function renderSupportRoute(path: string, support = supportRepository()) {
  const draft = baseTrainingDraft();
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter
        supportRepository={support}
        getCurrentUserId={async () => draft.userId}
        trainingOnline
      />
    </MemoryRouter>,
  );
}

function emitAuthState(event: string, ownerUserId?: string): void {
  act(() => {
    for (const callback of authStateCallbacks) {
      callback(
        event,
        ownerUserId ? { user: { id: ownerUserId } } : null,
      );
    }
  });
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

describe('private progress routes', () => {
  afterEach(cleanup);

  it('renders the private progress surface at /progress', async () => {
    renderRoute('/progress', progressRepository());

    expect(await screen.findByText('0 点')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '我的转念力' }))
      .toBeInTheDocument();
  });

  it('renders the controlled follow-up form at /reviews/:completionId', () => {
    renderRoute(
      '/reviews/55555555-5555-4555-8555-555555555555',
      progressRepository(),
    );

    expect(screen.getByRole('heading', { name: '后来发生了什么？' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('participant support routes', () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    trainingDraftStore.removeAllFromMemory();
    currentTrainingSupportIntent.clearAll();
    authStateCallbacks.clear();
    getUserMock.mockReset();
    onAuthStateChangeMock.mockClear();
    unsubscribeAuthMock.mockClear();
  });

  it('renders the static hub without constructing a Supabase repository', () => {
    renderRoute('/support');

    expect(screen.getByRole('heading', { name: '支持与安全' }))
      .toBeInTheDocument();
  });

  it.each([
    ['/support/request', '请求教练帮助'],
    ['/support/status', '查看提交状态'],
    ['/support/safety-report', '创建安全报告'],
  ])('renders %s', async (path, heading) => {
    renderSupportRoute(path);

    expect(await screen.findByRole('heading', { name: heading }))
      .toBeInTheDocument();
  });

  it('loads an owned session safety context only on the session report route', async () => {
    const draft = baseTrainingDraft();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    renderSupportRoute(`/support/safety-report/${draft.sessionId}`);

    expect(await screen.findByRole('heading', { name: '创建安全报告' }))
      .toBeInTheDocument();
    expect(screen.getByText(new RegExp(draft.scene.id))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('user_declared_danger');
  });

  it('resets report confirmation when a rejected session falls back to generic', async () => {
    const draft = baseTrainingDraft();
    const support = supportRepository();
    support.createSafetyReport = vi.fn().mockRejectedValue(
      new Error('safety_source_unavailable'),
    );
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    const user = userEvent.setup();
    renderSupportRoute(`/support/safety-report/${draft.sessionId}`, support);

    const confirmation = await screen.findByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    });
    await user.click(confirmation);
    await user.click(screen.getByRole('button', {
      name: '确认提交安全报告',
    }));
    await user.click(await screen.findByRole('link', {
      name: '创建不带训练会话的安全报告',
    }));

    expect(await screen.findAllByRole('radio')).toHaveLength(8);
    expect(screen.getByRole('checkbox', {
      name: '我确认将上面列出的最少必要信息提交给安全负责人',
    })).not.toBeChecked();
  });

  it('clears a live snapshot when identity fails so re-entry is no_snapshot', async () => {
    const draft = completedSupportTrainingDraft();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);
    currentTrainingSupportIntent.set(buildCurrentTrainingSupportIntent(
      draft.userId,
      '55555555-5555-4555-8555-555555555555',
      draft,
    ));
    render(
      <MemoryRouter initialEntries={['/support/request']}>
        <AppRouter
          supportRepository={supportRepository()}
          getCurrentUserId={async () => {
            throw new Error('current_user_unavailable');
          }}
          trainingOnline
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '无法核对账户' }))
      .toBeInTheDocument();
    expect(currentTrainingSupportIntent.peek(draft.userId)).toBeNull();
    expect(loadSafetyContext(draft.userId, draft.sessionId)).not.toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId))
      .not.toBeNull();

    cleanup();
    renderSupportRoute('/support/request');
    expect(await screen.findByRole('heading', { name: '请求教练帮助' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '分享这次训练选择' }))
      .not.toBeInTheDocument();
    expect(screen.getByText(/当前没有可核对的本次训练快照/))
      .toBeInTheDocument();
  });

  it('removes other owners safety state after a verified owner succeeds', async () => {
    const oldDraft = baseTrainingDraft();
    const currentOwner = '22222222-2222-4222-8222-222222222222';
    const currentSession = '33333333-3333-4333-8333-333333333333';
    saveSafetyContext(oldDraft.userId, oldDraft.sessionId, {
      sceneVersionId: oldDraft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(oldDraft.userId, oldDraft.sessionId);
    saveSafetyContext(currentOwner, currentSession, {
      sceneVersionId: oldDraft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(currentOwner, currentSession);

    render(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter
          supportRepository={supportRepository()}
          getCurrentUserId={async () => currentOwner}
          trainingOnline
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: '查看提交状态' }))
      .toBeInTheDocument();

    expect(loadSafetyContext(oldDraft.userId, oldDraft.sessionId)).toBeNull();
    expect(loadSafetyStopRetryMarker(oldDraft.userId, oldDraft.sessionId))
      .toBeNull();
    expect(loadSafetyContext(currentOwner, currentSession)).not.toBeNull();
    expect(loadSafetyStopRetryMarker(currentOwner, currentSession))
      .not.toBeNull();
  });

  it('clears the last verified owner only for an explicit signed-out result', async () => {
    const draft = completedSupportTrainingDraft();
    const support = supportRepository();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);
    const firstIdentity = async () => draft.userId;
    const view = render(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter
          supportRepository={support}
          getCurrentUserId={firstIdentity}
          trainingOnline
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: '查看提交状态' }))
      .toBeInTheDocument();
    currentTrainingSupportIntent.set(buildCurrentTrainingSupportIntent(
      draft.userId,
      '55555555-5555-4555-8555-555555555555',
      draft,
    ));
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    view.rerender(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter
          supportRepository={support}
          trainingOnline
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: '无法核对账户' }))
      .toBeInTheDocument();

    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
    expect(currentTrainingSupportIntent.peek(draft.userId)).toBeNull();
  });

  it('keeps the handoff through StrictMode but clears it on a real loading-route exit', async () => {
    const draft = completedSupportTrainingDraft();
    const intent = buildCurrentTrainingSupportIntent(
      draft.userId,
      '55555555-5555-4555-8555-555555555555',
      draft,
    );
    currentTrainingSupportIntent.set(intent);
    const first = render(
      <StrictMode>
        <MemoryRouter initialEntries={['/support/request']}>
          <AppRouter
            supportRepository={supportRepository()}
            getCurrentUserId={async () => draft.userId}
            trainingOnline
          />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole('radio', {
      name: '分享这次训练选择',
    })).toBeInTheDocument();
    first.unmount();

    currentTrainingSupportIntent.set(intent);
    const neverResolves = new Promise<string>(() => undefined);
    const second = render(
      <MemoryRouter initialEntries={['/support/request']}>
        <AppRouter
          supportRepository={supportRepository()}
          getCurrentUserId={() => neverResolves}
          trainingOnline
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '正在核对账户' }))
      .toBeInTheDocument();
    second.unmount();
    await waitFor(() => {
      expect(currentTrainingSupportIntent.peek(draft.userId)).toBeNull();
    });
  });

  it('remounts request state for a newly verified owner', async () => {
    const firstOwner = baseTrainingDraft().userId;
    const secondOwner = '22222222-2222-4222-8222-222222222222';
    let resolveSecondOwner!: (value: string) => void;
    const pendingSecondOwner = new Promise<string>((resolve) => {
      resolveSecondOwner = resolve;
    });
    const firstIdentity = async () => firstOwner;
    const secondIdentity = () => pendingSecondOwner;
    const support = supportRepository();
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter initialEntries={['/support/request']}>
        <AppRouter
          supportRepository={support}
          getCurrentUserId={firstIdentity}
          trainingOnline
        />
      </MemoryRouter>,
    );

    await user.type(await screen.findByRole('textbox', {
      name: '补充说明（可选）',
    }), '旧账户内容');
    view.rerender(
      <MemoryRouter initialEntries={['/support/request']}>
        <AppRouter
          supportRepository={support}
          getCurrentUserId={secondIdentity}
          trainingOnline
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '正在核对账户' }))
      .toBeInTheDocument();
    expect(screen.queryByRole('textbox', {
      name: '补充说明（可选）',
    })).not.toBeInTheDocument();
    resolveSecondOwner(secondOwner);
    expect(await screen.findByRole('textbox', {
      name: '补充说明（可选）',
    })).toHaveValue('');
  });

  it('hides old support statuses while verifying and loading a new owner', async () => {
    const firstOwner = baseTrainingDraft().userId;
    const secondOwner = '22222222-2222-4222-8222-222222222222';
    const firstTicket: MySupportTicketStatus = {
      ticketId: '66666666-6666-4666-8666-666666666666',
      status: 'submitted',
      snapshotShared: false,
      submittedAt: '2026-07-23T08:00:00.000Z',
      firstResponseDueAt: '2026-07-24T08:00:00.000Z',
    };
    const secondTicket: MySupportTicketStatus = {
      ...firstTicket,
      ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    let resolveSecondOwner!: (value: string) => void;
    const pendingSecondOwner = new Promise<string>((resolve) => {
      resolveSecondOwner = resolve;
    });
    const support = supportRepository();
    support.listMySupportTickets = vi.fn()
      .mockResolvedValueOnce([firstTicket])
      .mockResolvedValueOnce([secondTicket]);
    const firstIdentity = async () => firstOwner;
    const secondIdentity = () => pendingSecondOwner;
    const view = render(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter
          supportRepository={support}
          getCurrentUserId={firstIdentity}
          trainingOnline
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText(firstTicket.ticketId)).toBeInTheDocument();
    view.rerender(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter
          supportRepository={support}
          getCurrentUserId={secondIdentity}
          trainingOnline
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '正在核对账户' }))
      .toBeInTheDocument();
    expect(screen.queryByText(firstTicket.ticketId)).not.toBeInTheDocument();
    resolveSecondOwner(secondOwner);
    expect(await screen.findByText(secondTicket.ticketId)).toBeInTheDocument();
    expect(screen.queryByText(firstTicket.ticketId)).not.toBeInTheDocument();
  });

  it('reacts to production SIGNED_OUT, clears every owner, and unsubscribes', async () => {
    const draft = completedSupportTrainingDraft();
    const otherOwner = '22222222-2222-4222-8222-222222222222';
    const otherSession = '33333333-3333-4333-8333-333333333333';
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: draft.userId } },
      error: null,
    });
    const support = supportRepository();
    const view = render(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter supportRepository={support} trainingOnline />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: '查看提交状态' }))
      .toBeInTheDocument();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);
    saveSafetyContext(otherOwner, otherSession, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(otherOwner, otherSession);
    currentTrainingSupportIntent.set(buildCurrentTrainingSupportIntent(
      draft.userId,
      '55555555-5555-4555-8555-555555555555',
      draft,
    ));

    emitAuthState('SIGNED_OUT');

    expect(screen.getByRole('heading', { name: '无法核对账户' }))
      .toBeInTheDocument();
    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyContext(otherOwner, otherSession)).toBeNull();
    expect(loadSafetyStopRetryMarker(otherOwner, otherSession)).toBeNull();
    expect(currentTrainingSupportIntent.peek(draft.userId)).toBeNull();

    view.unmount();
    expect(unsubscribeAuthMock).toHaveBeenCalledTimes(1);
    expect(authStateCallbacks.size).toBe(0);
  });

  it('clears all persisted safety state on a fresh signed-out load', async () => {
    const draft = baseTrainingDraft();
    const otherOwner = '22222222-2222-4222-8222-222222222222';
    const otherSession = '33333333-3333-4333-8333-333333333333';
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);
    saveSafetyContext(otherOwner, otherSession, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(otherOwner, otherSession);
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter
          supportRepository={supportRepository()}
          trainingOnline
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: '无法核对账户' }))
      .toBeInTheDocument();

    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyContext(otherOwner, otherSession)).toBeNull();
    expect(loadSafetyStopRetryMarker(otherOwner, otherSession)).toBeNull();
  });

  it('hides owner A and re-verifies before rendering owner B', async () => {
    const draft = baseTrainingDraft();
    const ownerB = '22222222-2222-4222-8222-222222222222';
    const sessionB = '33333333-3333-4333-8333-333333333333';
    const ticketA: MySupportTicketStatus = {
      ticketId: '66666666-6666-4666-8666-666666666666',
      status: 'submitted',
      snapshotShared: false,
      submittedAt: '2026-07-23T08:00:00.000Z',
      firstResponseDueAt: '2026-07-24T08:00:00.000Z',
    };
    const ticketB: MySupportTicketStatus = {
      ...ticketA,
      ticketId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    let resolveOwnerB!: (value: {
      data: { user: { id: string } };
      error: null;
    }) => void;
    const pendingOwnerB = new Promise<{
      data: { user: { id: string } };
      error: null;
    }>((resolve) => {
      resolveOwnerB = resolve;
    });
    getUserMock
      .mockResolvedValueOnce({
        data: { user: { id: draft.userId } },
        error: null,
      })
      .mockImplementationOnce(() => pendingOwnerB);
    const support = supportRepository();
    support.listMySupportTickets = vi.fn()
      .mockResolvedValueOnce([ticketA])
      .mockResolvedValueOnce([ticketB]);
    render(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter supportRepository={support} trainingOnline />
      </MemoryRouter>,
    );
    expect(await screen.findByText(ticketA.ticketId)).toBeInTheDocument();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);
    saveSafetyContext(ownerB, sessionB, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(ownerB, sessionB);

    emitAuthState('SIGNED_IN', ownerB);

    expect(screen.getByRole('heading', { name: '正在核对账户' }))
      .toBeInTheDocument();
    expect(screen.queryByText(ticketA.ticketId)).not.toBeInTheDocument();
    await act(async () => {
      resolveOwnerB({
        data: { user: { id: ownerB } },
        error: null,
      });
    });
    expect(await screen.findByText(ticketB.ticketId)).toBeInTheDocument();
    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyContext(ownerB, sessionB)).not.toBeNull();
    expect(loadSafetyStopRetryMarker(ownerB, sessionB)).not.toBeNull();
  });

  it('keeps safety state when auth re-verification fails transiently', async () => {
    const draft = baseTrainingDraft();
    const ownerB = '22222222-2222-4222-8222-222222222222';
    const sessionB = '33333333-3333-4333-8333-333333333333';
    getUserMock
      .mockResolvedValueOnce({
        data: { user: { id: draft.userId } },
        error: null,
      })
      .mockRejectedValueOnce(new Error('network unavailable'));
    render(
      <MemoryRouter initialEntries={['/support/status']}>
        <AppRouter
          supportRepository={supportRepository()}
          trainingOnline
        />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: '查看提交状态' }))
      .toBeInTheDocument();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);
    saveSafetyContext(ownerB, sessionB, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(ownerB, sessionB);

    emitAuthState('SIGNED_IN', ownerB);

    expect(await screen.findByRole('heading', { name: '无法核对账户' }))
      .toBeInTheDocument();
    expect(loadSafetyContext(draft.userId, draft.sessionId)).not.toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId))
      .not.toBeNull();
    expect(loadSafetyContext(ownerB, sessionB)).not.toBeNull();
    expect(loadSafetyStopRetryMarker(ownerB, sessionB)).not.toBeNull();
  });
});

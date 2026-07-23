import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from '../../app/router';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import { trainingReducer } from '../../domain/training/trainingReducer';
import type { SceneRepository } from '../../lib/repositories/SceneRepository';
import type {
  TrainingRuntimeRepository,
  TrainingRuntimeRoute,
} from '../../lib/repositories/TrainingRuntimeRepository';
import { validPublishedScene } from '../../test/fixtures/scene';
import { actionTimes, baseTrainingDraft } from '../../test/fixtures/training';
import { saveSafetyContext, trainingDraftStore } from './trainingDraftStore';

const userId = baseTrainingDraft().userId;
const sessionId = baseTrainingDraft().sessionId;
const fixedNow = new Date('2026-07-22T12:10:00.000Z');

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>浏览器返回</button>;
}

function sceneRepository(
  overrides: Partial<SceneRepository> = {},
): SceneRepository {
  return {
    listPublished: vi.fn(async () => [validPublishedScene]),
    getBySlug: vi.fn(async (slug) => (
      slug === validPublishedScene.slug ? validPublishedScene : null
    )),
    getPublishedById: vi.fn(async (id) => (
      id === validPublishedScene.id ? validPublishedScene : null
    )),
    ...overrides,
  };
}

function runtimeRepository(
  overrides: Partial<TrainingRuntimeRepository> = {},
): TrainingRuntimeRepository {
  return {
    startTraining: vi.fn(async (): Promise<{
      sessionId: string;
      route: TrainingRuntimeRoute;
    }> => ({ sessionId, route: 'continue' })),
    checkTrainingSession: vi.fn(
      async (): Promise<TrainingRuntimeRoute> => 'continue',
    ),
    ...overrides,
  };
}

type Dependencies = {
  sceneRepository?: SceneRepository;
  runtimeRepository?: TrainingRuntimeRepository;
  getCurrentUserId?: () => Promise<string>;
};

function renderRoute(
  path: string,
  dependencies: Dependencies = {},
  options: {
    strict?: boolean;
    entries?: string[];
    backButton?: boolean;
    injectNow?: boolean;
  } = {},
) {
  const app = (
    <MemoryRouter
      initialEntries={options.entries ?? [path]}
      initialIndex={(options.entries?.length ?? 1) - 1}
    >
      <AppRouter
        sceneRepository={dependencies.sceneRepository}
        runtimeRepository={dependencies.runtimeRepository}
        getCurrentUserId={dependencies.getCurrentUserId ?? (async () => userId)}
        trainingNow={options.injectNow === false ? undefined : () => fixedNow}
        trainingOnline
      />
      <LocationProbe />
      {options.backButton && <BackButton />}
    </MemoryRouter>
  );
  return render(options.strict ? <StrictMode>{app}</StrictMode> : app);
}

describe('training routes', () => {
  beforeEach(() => {
    sessionStorage.clear();
    trainingDraftStore.removeAllFromMemory();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('starts a published scene once and replaces into its pinned safety-fact route', async () => {
    const scenes = sceneRepository();
    const runtime = runtimeRepository();

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: scenes,
      runtimeRepository: runtime,
    });

    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
    expect(screen.getByTestId('current-path'))
      .toHaveTextContent(`/training/${sessionId}/safety-fact`);
    expect(runtime.startTraining).toHaveBeenCalledTimes(1);
    expect(runtime.startTraining).toHaveBeenCalledWith(
      validPublishedScene.id,
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
  });

  it('deduplicates StrictMode start calls with one request id', async () => {
    const runtime = runtimeRepository();

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
    }, { strict: true });

    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
    expect(runtime.startTraining).toHaveBeenCalledTimes(1);
  });

  it('does not share an in-flight start across scene versions with the same request id', async () => {
    const requestId = '70000000-0000-0000-0000-000000000001';
    const otherSceneVersionId = '10000000-0000-0000-0000-000000000099';
    const firstSlug = 'first-scene';
    const secondSlug = 'second-scene';
    sessionStorage.setItem(
      `turning-mind:pending-start:${userId}:${firstSlug}`,
      JSON.stringify({
        userId,
        sceneVersionId: validPublishedScene.id,
        slug: firstSlug,
        requestId,
      }),
    );
    sessionStorage.setItem(
      `turning-mind:pending-start:${userId}:${secondSlug}`,
      JSON.stringify({
        userId,
        sceneVersionId: otherSceneVersionId,
        slug: secondSlug,
        requestId,
      }),
    );
    const startTraining = vi.fn(() => new Promise<{
      sessionId: string;
      route: TrainingRuntimeRoute;
    }>(() => undefined));
    const runtime = runtimeRepository({ startTraining });

    renderRoute(`/train/${firstSlug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
    });
    renderRoute(`/train/${secondSlug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
    });

    await waitFor(() => expect(startTraining).toHaveBeenCalledTimes(2));
    expect(startTraining.mock.calls).toEqual([
      [validPublishedScene.id, requestId],
      [otherSceneVersionId, requestId],
    ]);
  });

  it('does not share an in-flight start across users with the same scene and request id', async () => {
    const requestId = '70000000-0000-0000-0000-000000000002';
    const otherUserId = '50000000-0000-4000-8000-000000000002';
    const slug = 'shared-scene';
    for (const pendingUserId of [userId, otherUserId]) {
      sessionStorage.setItem(
        `turning-mind:pending-start:${pendingUserId}:${slug}`,
        JSON.stringify({
          userId: pendingUserId,
          sceneVersionId: validPublishedScene.id,
          slug,
          requestId,
        }),
      );
    }
    const startTraining = vi.fn(() => new Promise<{
      sessionId: string;
      route: TrainingRuntimeRoute;
    }>(() => undefined));
    const runtime = runtimeRepository({ startTraining });

    renderRoute(`/train/${slug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
      getCurrentUserId: async () => userId,
    });
    renderRoute(`/train/${slug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
      getCurrentUserId: async () => otherUserId,
    });

    await waitFor(() => expect(startTraining).toHaveBeenCalledTimes(2));
    expect(startTraining.mock.calls).toEqual([
      [validPublishedScene.id, requestId],
      [validPublishedScene.id, requestId],
    ]);
  });

  it('completes a start route with the stable system clock default', async () => {
    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtimeRepository(),
    }, { injectNow: false });

    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
  });

  it('retries a start error with the same pending request id', async () => {
    const user = userEvent.setup();
    const startTraining = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ sessionId, route: 'continue' });
    const runtime = runtimeRepository({ startTraining });

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('无法开始训练');
    const firstRequestId = startTraining.mock.calls[0][1];
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
    expect(startTraining).toHaveBeenCalledTimes(2);
    expect(startTraining.mock.calls[1][1]).toBe(firstRequestId);
  });

  it('keeps the original version pin when a retry sees a newer slug version', async () => {
    const user = userEvent.setup();
    const newerScene = {
      ...validPublishedScene,
      id: '10000000-0000-0000-0000-000000000099',
      version: validPublishedScene.version + 1,
      changeSummary: 'later version',
    };
    const getBySlug = vi.fn()
      .mockResolvedValueOnce(validPublishedScene)
      .mockResolvedValue(newerScene);
    const getPublishedById = vi.fn(async (id) => (
      id === validPublishedScene.id ? validPublishedScene : null
    ));
    const startTraining = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ sessionId, route: 'continue' as const });

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository({ getBySlug, getPublishedById }),
      runtimeRepository: runtimeRepository({ startTraining }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('无法开始训练');
    const firstRequestId = startTraining.mock.calls[0][1];
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
    expect(startTraining.mock.calls).toEqual([
      [validPublishedScene.id, firstRequestId],
      [validPublishedScene.id, firstRequestId],
    ]);
    expect(getPublishedById).toHaveBeenCalledWith(validPublishedScene.id);
  });

  it('replays the pinned start before reading content after a lost response', async () => {
    const user = userEvent.setup();
    const getBySlug = vi.fn()
      .mockResolvedValueOnce(validPublishedScene)
      .mockResolvedValue({
        ...validPublishedScene,
        id: '10000000-0000-0000-0000-000000000099',
        version: validPublishedScene.version + 1,
      });
    const getPublishedById = vi.fn(async () => null);
    const startTraining = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ sessionId, route: 'safety-stop' as const });

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository({ getBySlug, getPublishedById }),
      runtimeRepository: runtimeRepository({ startTraining }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('无法开始训练');
    const firstRequestId = startTraining.mock.calls[0][1];
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByRole('heading', {
      name: '优先保护你和相关人的安全',
    })).toBeInTheDocument();
    expect(startTraining.mock.calls).toEqual([
      [validPublishedScene.id, firstRequestId],
      [validPublishedScene.id, firstRequestId],
    ]);
    expect(getBySlug).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('先只看发生了什么')).not.toBeInTheDocument();
  });

  it('replays the RPC after a continue result cannot load its pinned content', async () => {
    const user = userEvent.setup();
    const newerScene = {
      ...validPublishedScene,
      id: '10000000-0000-0000-0000-000000000099',
      version: validPublishedScene.version + 1,
    };
    const getBySlug = vi.fn()
      .mockResolvedValueOnce(validPublishedScene)
      .mockResolvedValue(newerScene);
    const getPublishedById = vi.fn()
      .mockRejectedValueOnce(new Error('temporary content failure'))
      .mockResolvedValue(null);
    const startTraining = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ sessionId, route: 'continue' as const })
      .mockResolvedValueOnce({ sessionId, route: 'content-update' as const });

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository({ getBySlug, getPublishedById }),
      runtimeRepository: runtimeRepository({ startTraining }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('无法开始训练');
    const requestId = startTraining.mock.calls[0][1];
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('无法开始训练');
    await user.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByRole('heading', { name: '本场景内容已更新' }))
      .toBeInTheDocument();
    expect(startTraining.mock.calls).toEqual([
      [validPublishedScene.id, requestId],
      [validPublishedScene.id, requestId],
      [validPublishedScene.id, requestId],
    ]);
  });

  it('explicitly discards a stuck pending start before allowing a newer version', async () => {
    const user = userEvent.setup();
    const newerScene = {
      ...validPublishedScene,
      id: '10000000-0000-0000-0000-000000000099',
      version: validPublishedScene.version + 1,
    };
    const getBySlug = vi.fn()
      .mockResolvedValueOnce(validPublishedScene)
      .mockResolvedValue(newerScene);
    const getPublishedById = vi.fn(async () => null);
    const startTraining = vi.fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ sessionId, route: 'continue' as const })
      .mockResolvedValueOnce({ sessionId, route: 'continue' as const });
    const scenes = sceneRepository({ getBySlug, getPublishedById });
    const runtime = runtimeRepository({ startTraining });

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: scenes,
      runtimeRepository: runtime,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('无法开始训练');
    const oldRequestId = startTraining.mock.calls[0][1];
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('无法开始训练');

    await user.click(screen.getByRole('button', { name: '放弃这次并返回场景' }));
    expect(screen.getByTestId('current-path')).toHaveTextContent('/scenes');

    cleanup();
    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: scenes,
      runtimeRepository: runtime,
    });
    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
    expect(startTraining.mock.calls[2][0]).toBe(newerScene.id);
    expect(startTraining.mock.calls[2][1]).not.toBe(oldRequestId);
  });

  it('shows missing and repository failures without mock scene fallback', async () => {
    const runtime = runtimeRepository();
    renderRoute('/train/not-found', {
      sceneRepository: sceneRepository({ getBySlug: vi.fn(async () => null) }),
      runtimeRepository: runtime,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('没有找到这个场景');
    expect(runtime.startTraining).not.toHaveBeenCalled();

    cleanup();
    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository({
        getBySlug: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
      runtimeRepository: runtime,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('场景加载失败');
    expect(runtime.startTraining).not.toHaveBeenCalled();
  });

  it('routes a server stop directly to safety without creating an ordinary draft', async () => {
    const stopScene: PublishedSceneVersion = {
      ...validPublishedScene,
      riskLevel: 'stop' as const,
      hypotheses: [],
      strengthLens: undefined,
      boundary: null,
      newExpression: null,
      microAction: null,
      fallbackPlan: null,
      safetyRoute: {
        heading: '先保护自己',
        body: '请先离开可能继续升级的环境。',
        actions: ['exit', 'trusted-support', 'local-emergency', 'safety-report'],
      },
    };
    const scenes = sceneRepository({
      getBySlug: vi.fn(async () => stopScene),
      getPublishedById: vi.fn(async () => stopScene),
    });
    const runtime = runtimeRepository({
      startTraining: vi.fn(async (): Promise<{
        sessionId: string;
        route: TrainingRuntimeRoute;
      }> => ({ sessionId, route: 'safety-stop' })),
    });

    renderRoute(`/train/${stopScene.slug}`, {
      sceneRepository: scenes,
      runtimeRepository: runtime,
    });

    expect(await screen.findByRole('heading', { name: '先保护自己' })).toBeInTheDocument();
    expect(screen.getByTestId('current-path'))
      .toHaveTextContent(`/training/${sessionId}/safety-stop`);
    expect(screen.queryByText('还可能看见的特点或品格种子')).not.toBeInTheDocument();
    expect(trainingDraftStore.load(userId, sessionId, fixedNow)).toBeNull();
    const raw = sessionStorage.getItem(`turning-mind:safety:${sessionId}`);
    expect(raw).toBe(JSON.stringify({
      sceneVersionId: stopScene.id,
      source: 'server',
    }));
    expect(raw).not.toContain('signalCode');
  });

  it('keeps the full safety page when session storage rejects the safety context write', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const runtime = runtimeRepository({
      startTraining: vi.fn(async (): Promise<{
        sessionId: string;
        route: TrainingRuntimeRoute;
      }> => ({ sessionId, route: 'safety-stop' })),
    });

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
    });

    expect(await screen.findByRole('heading', {
      name: '优先保护你和相关人的安全',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出训练' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '联系可信任的人' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '请求转交安全支持' })).toBeEnabled();
    expect(sessionStorage.getItem(`turning-mind:safety:${sessionId}`)).toBeNull();
  });

  it('recovers only the exact pinned version and restarts at safety confirmation', async () => {
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);
    trainingDraftStore.removeAllFromMemory();
    const getPublishedById = vi.fn(async (id) => (
      id === draft.scene.id ? draft.scene : null
    ));
    const getBySlug = vi.fn(async () => ({
      ...draft.scene,
      id: '10000000-0000-0000-0000-000000000999',
      version: draft.scene.version + 1,
    }));
    const scenes = sceneRepository({ getPublishedById, getBySlug });

    renderRoute(`/training/${draft.sessionId}/expression-action`, {
      sceneRepository: scenes,
      runtimeRepository: runtimeRepository(),
    });

    expect(await screen.findByText(
      '为保护隐私，刚才的选择没有保存，请从安全确认重新开始。',
    )).toHaveAttribute('role', 'status');
    expect(screen.getByRole('heading', { name: '先只看发生了什么' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('current-path'))
        .toHaveTextContent(`/training/${draft.sessionId}/safety-fact`);
    });
    expect(getPublishedById).toHaveBeenCalledWith(draft.scene.id);
    expect(getBySlug).not.toHaveBeenCalled();
  });

  it('canonicalizes stale and forged step URLs from valid reducer state', async () => {
    const draft = trainingReducer(
      trainingReducer(baseTrainingDraft(), {
        type: 'confirm-safe-facts',
        at: actionTimes.facts,
      }),
      {
        type: 'choose-first-thought',
        value: { kind: 'uncertain' },
        at: actionTimes.thought,
      },
    );
    trainingDraftStore.save(draft);

    renderRoute(`/training/${draft.sessionId}/expression-action`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtimeRepository(),
    });

    expect(await screen.findByRole('heading', {
      name: '这条关系回路可能怎样继续？',
    })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('current-path'))
        .toHaveTextContent(`/training/${draft.sessionId}/relationship-fork`);
    });
  });

  it.each([
    ['/training/not-a-uuid/safety-fact', '训练链接无效'],
    [`/training/${sessionId}/not-a-step`, '训练链接无效'],
    [`/training/${sessionId}/hypotheses`, '无法恢复这次练习'],
  ])('fails closed for %s', async (path, message) => {
    const runtime = runtimeRepository();
    renderRoute(path, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(runtime.startTraining).not.toHaveBeenCalled();
  });

  it('clears recovery for content update and routes server safety without a user signal', async () => {
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);
    trainingDraftStore.removeAllFromMemory();
    renderRoute(`/training/${draft.sessionId}/safety-fact`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtimeRepository({
        checkTrainingSession: vi.fn(
          async (): Promise<TrainingRuntimeRoute> => 'content-update',
        ),
      }),
    });

    expect(await screen.findByRole('heading', { name: '本场景内容已更新' }))
      .toBeInTheDocument();
    expect(sessionStorage.getItem(
      `turning-mind:draft:${draft.userId}:${draft.sessionId}`,
    )).toBeNull();

    cleanup();
    trainingDraftStore.save(draft);
    trainingDraftStore.removeAllFromMemory();
    renderRoute(`/training/${draft.sessionId}/safety-fact`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtimeRepository({
        checkTrainingSession: vi.fn(
          async (): Promise<TrainingRuntimeRoute> => 'safety-stop',
        ),
      }),
    });
    expect(await screen.findByRole('heading', {
      name: '优先保护你和相关人的安全',
    })).toBeInTheDocument();
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .toBe(JSON.stringify({
        sceneVersionId: draft.scene.id,
        source: 'server',
      }));
  });

  it('preserves the envelope and offers retry on recovery network errors', async () => {
    const user = userEvent.setup();
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);
    trainingDraftStore.removeAllFromMemory();
    const checkTrainingSession = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue('continue');

    renderRoute(`/training/${draft.sessionId}/safety-fact`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtimeRepository({ checkTrainingSession }),
    });

    expect(await screen.findByRole('heading', { name: '暂时无法恢复' }))
      .toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('不会清除当前会话中的恢复信封');
    expect(sessionStorage.getItem(
      `turning-mind:draft:${draft.userId}:${draft.sessionId}`,
    )).not.toBeNull();
    await user.click(screen.getByRole('button', { name: '重试恢复' }));
    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
  });

  it('preserves the envelope and retries after a transient current-user lookup failure', async () => {
    const user = userEvent.setup();
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);
    trainingDraftStore.removeAllFromMemory();
    const getCurrentUserId = vi.fn()
      .mockRejectedValueOnce(new Error('auth network unavailable'))
      .mockResolvedValueOnce(userId);

    renderRoute(`/training/${draft.sessionId}/safety-fact`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtimeRepository(),
      getCurrentUserId,
    });

    expect(await screen.findByRole('heading', { name: '暂时无法恢复' }))
      .toBeInTheDocument();
    expect(sessionStorage.getItem(
      `turning-mind:draft:${draft.userId}:${draft.sessionId}`,
    )).not.toBeNull();

    await user.click(screen.getByRole('button', { name: '重试恢复' }));
    expect(await screen.findByRole('heading', { name: '先只看发生了什么' }))
      .toBeInTheDocument();
    expect(getCurrentUserId).toHaveBeenCalledTimes(2);
  });

  it('uses replace safety navigation so Back does not reopen the ordinary start route', async () => {
    const user = userEvent.setup();
    const runtime = runtimeRepository({
      startTraining: vi.fn(async (): Promise<{
        sessionId: string;
        route: TrainingRuntimeRoute;
      }> => ({ sessionId, route: 'safety-stop' })),
    });

    renderRoute(`/train/${validPublishedScene.slug}`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtime,
    }, {
      entries: ['/scenes', `/train/${validPublishedScene.slug}`],
      backButton: true,
    });
    expect(await screen.findByRole('heading', {
      name: '优先保护你和相关人的安全',
    })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '浏览器返回' }));
    expect(await screen.findByRole('heading', { name: '从最像你家的场景开始' }))
      .toBeInTheDocument();
    expect(screen.queryByText('正在开始训练')).not.toBeInTheDocument();
  });

  it('keeps the safety hard stop when the exact scene is withdrawn', async () => {
    saveSafetyContext(sessionId, {
      sceneVersionId: validPublishedScene.id,
      source: 'server',
    });
    const getBySlug = vi.fn(async () => ({
      ...validPublishedScene,
      id: '10000000-0000-0000-0000-000000000999',
      version: validPublishedScene.version + 1,
    }));

    renderRoute(`/training/${sessionId}/safety-stop`, {
      sceneRepository: sceneRepository({
        getPublishedById: vi.fn(async () => null),
        getBySlug,
      }),
      runtimeRepository: runtimeRepository(),
    });

    expect(await screen.findByRole('heading', {
      name: '优先保护你和相关人的安全',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '请求转交安全支持' }))
      .toBeInTheDocument();
    expect(getBySlug).not.toHaveBeenCalled();
    expect(screen.queryByText('先只看发生了什么')).not.toBeInTheDocument();
  });

  it('keeps every generic safety action available when authored content cannot load', async () => {
    saveSafetyContext(sessionId, {
      sceneVersionId: validPublishedScene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });

    renderRoute(`/training/${sessionId}/safety-stop`, {
      sceneRepository: sceneRepository({
        getPublishedById: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
      runtimeRepository: runtimeRepository(),
    });

    expect(await screen.findByRole('heading', {
      name: '优先保护你和相关人的安全',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出训练' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '联系可信任的人' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '请求转交安全支持' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '重试加载场景安全说明' })).toBeEnabled();
    expect(screen.queryByText('先只看发生了什么')).not.toBeInTheDocument();
  });

  it('keeps full safety actions and fails closed on Back after danger when storage is unavailable', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const draft = trainingReducer(
      trainingReducer(
        trainingReducer(baseTrainingDraft(), {
          type: 'confirm-safe-facts',
          at: actionTimes.facts,
        }),
        {
          type: 'choose-first-thought',
          value: { kind: 'uncertain' },
          at: actionTimes.thought,
        },
      ),
      {
        type: 'choose-prediction',
        response: '争辩或反抗',
        at: actionTimes.prediction,
      },
    );
    trainingDraftStore.save(draft);

    renderRoute(`/training/${draft.sessionId}/hypotheses`, {
      sceneRepository: sceneRepository(),
      runtimeRepository: runtimeRepository(),
    }, {
      entries: [
        `/training/${draft.sessionId}/relationship-fork`,
        `/training/${draft.sessionId}/hypotheses`,
      ],
      backButton: true,
    });

    expect(await screen.findByRole('heading', { name: '至少保留两种解释' }))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '这里存在伤害或危险' }));
    expect(await screen.findByRole('heading', {
      name: '优先保护你和相关人的安全',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出训练' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '联系可信任的人' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '请求转交安全支持' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '浏览器返回' }));

    expect(await screen.findByRole('heading', { name: '无法恢复练习' }))
      .toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('不会自动开始新训练');
    expect(screen.queryByText('这条关系回路可能怎样继续？')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(
      `turning-mind:draft:${draft.userId}:${draft.sessionId}`,
    )).toBeNull();
  });
});

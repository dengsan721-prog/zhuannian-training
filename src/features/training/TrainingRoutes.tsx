import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CompletionResult } from '../../domain/progress/types';
import { createTrainingDraft } from '../../domain/training/trainingReducer';
import { ordinaryTrainingSteps } from '../../domain/training/types';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';
import type { SceneRepository } from '../../lib/repositories/SceneRepository';
import { SupabaseProgressRepository } from '../../lib/repositories/SupabaseProgressRepository';
import { SupabaseSceneRepository } from '../../lib/repositories/SupabaseSceneRepository';
import { SupabaseSupportRepository } from '../../lib/repositories/SupabaseSupportRepository';
import { SupabaseTrainingRuntimeRepository } from '../../lib/repositories/SupabaseTrainingRuntimeRepository';
import type { SupportRepository } from '../../lib/repositories/SupportRepository';
import type { TrainingRuntimeRepository } from '../../lib/repositories/TrainingRuntimeRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import { CompletionPage } from '../progress/CompletionPage';
import { pendingCompletionStore } from '../progress/pendingCompletionStore';
import { SafetyStopPage } from './SafetyStopPage';
import { TrainingPage } from './TrainingPage';
import {
  getOrCreatePendingStart,
  loadPendingStart,
  loadRecoveryEnvelope,
  loadSafetyContext,
  loadSafetyStopRetryMarker,
  removePendingStart,
  removeSafetyContext,
  removeSafetyStateForOtherUsers,
  removeSafetyStopRetryMarker,
  saveSafetyContext,
  saveSafetyStopRetryMarker,
  trainingDraftStore,
} from './trainingDraftStore';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const systemNow = () => new Date();
const startRequests = new Map<
  string,
  ReturnType<TrainingRuntimeRepository['startTraining']>
>();
const startRequestKey = (
  userId: string,
  sceneVersionId: string,
  requestId: string,
) => `${userId}:${sceneVersionId}:${requestId}`;

export type TrainingRouteDependencies = {
  sceneRepository?: SceneRepository;
  runtimeRepository?: TrainingRuntimeRepository;
  progressRepository?: ProgressRepository;
  supportRepository?: SupportRepository;
  getCurrentUserId?: () => Promise<string>;
  now?: () => Date;
  online?: boolean;
};

async function defaultCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  const userId = data.user?.id;
  if (error || !userId || !uuidPattern.test(userId)) {
    throw new Error('current_user_unavailable');
  }
  return userId;
}

function resolveSceneRepository(repository?: SceneRepository): SceneRepository {
  return repository ?? new SupabaseSceneRepository(getSupabaseClient());
}

function resolveRuntimeRepository(
  repository?: TrainingRuntimeRepository,
): TrainingRuntimeRepository {
  return repository ?? new SupabaseTrainingRuntimeRepository(getSupabaseClient());
}

function resolveProgressRepository(
  repository?: ProgressRepository,
): ProgressRepository {
  return repository ?? new SupabaseProgressRepository(getSupabaseClient());
}

function resolveSupportRepository(
  repository?: SupportRepository,
): SupportRepository {
  return repository ?? new SupabaseSupportRepository(getSupabaseClient());
}

function readErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return '';
  }
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
}

function RouteMessage({
  heading,
  message,
  status = 'alert',
  action,
  secondaryAction,
}: {
  heading: string;
  message: string;
  status?: 'alert' | 'status';
  action?: { label: string; run: () => void; disabled?: boolean };
  secondaryAction?: { label: string; run: () => void; disabled?: boolean };
}) {
  return (
    <main className="app-shell">
      <section className="surface training-route-message">
        <h1>{heading}</h1>
        <p role={status}>{message}</p>
        {(action || secondaryAction) && (
          <div className="route-actions">
            {action && (
              <button
                type="button"
                className="primary-action"
                disabled={action.disabled}
                onClick={action.run}
              >
                {action.label}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                className="secondary-action"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.run}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
        {!action && status === 'alert' && (
          <a className="primary-action" href="/scenes">返回场景页</a>
        )}
      </section>
    </main>
  );
}

function startOnce(
  repository: TrainingRuntimeRepository,
  userId: string,
  sceneVersionId: string,
  requestId: string,
) {
  const key = startRequestKey(userId, sceneVersionId, requestId);
  const current = startRequests.get(key);
  if (current) return current;
  const request = repository.startTraining(sceneVersionId, requestId);
  startRequests.set(key, request);
  void request.catch(() => {
    if (startRequests.get(key) === request) {
      startRequests.delete(key);
    }
  });
  return request;
}

export function TrainingStartRoute({
  sceneRepository,
  runtimeRepository,
  getCurrentUserId = defaultCurrentUserId,
  now = systemNow,
}: TrainingRouteDependencies) {
  const { sceneSlug = '' } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [discardContext, setDiscardContext] = useState<{
    userId: string;
    sceneVersionId: string;
    slug: string;
    requestId: string;
  } | null>(null);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'missing' }
    | { status: 'scene-error' }
    | { status: 'start-error' }
    | { status: 'content-update' }
  >({ status: 'loading' });

  useEffect(() => {
    let active = true;

    const start = async () => {
      if (!slugPattern.test(sceneSlug)) {
        if (active) setState({ status: 'missing' });
        return;
      }

      let userId: string;
      try {
        userId = await getCurrentUserId();
        if (!uuidPattern.test(userId)) throw new Error('invalid_current_user');
      } catch {
        if (active) setState({ status: 'start-error' });
        return;
      }
      if (!active) return;

      try {
        let scene = null;
        let pending = loadPendingStart(userId, sceneSlug);
        if (!pending) {
          try {
            scene = await resolveSceneRepository(sceneRepository).getBySlug(sceneSlug);
          } catch {
            if (active) setState({ status: 'scene-error' });
            return;
          }
          if (!active) return;
          if (!scene) {
            setState({ status: 'missing' });
            return;
          }
          pending = getOrCreatePendingStart(
            userId,
            scene.id,
            scene.slug,
          );
        }
        setDiscardContext({
          userId: pending.userId,
          sceneVersionId: pending.sceneVersionId,
          slug: pending.slug,
          requestId: pending.requestId,
        });
        const startRequest = startOnce(
          resolveRuntimeRepository(runtimeRepository),
          pending.userId,
          pending.sceneVersionId,
          pending.requestId,
        );
        const result = await startRequest;
        if (!active) return;
        const requestKey = startRequestKey(
          pending.userId,
          pending.sceneVersionId,
          pending.requestId,
        );
        if (startRequests.get(requestKey) === startRequest) {
          startRequests.delete(requestKey);
        }
        if (!uuidPattern.test(result.sessionId)) throw new Error('invalid_session_id');

        if (result.route === 'safety-stop') {
          saveSafetyContext(userId, result.sessionId, {
            sceneVersionId: pending.sceneVersionId,
            source: 'server',
          });
          removePendingStart(userId, sceneSlug);
          startRequests.delete(requestKey);
          navigate(`/training/${result.sessionId}/safety-stop`, { replace: true });
          return;
        }
        if (result.route === 'content-update') {
          removePendingStart(userId, sceneSlug);
          startRequests.delete(requestKey);
          setState({ status: 'content-update' });
          return;
        }
        if (result.route !== 'continue') throw new Error('invalid_training_route');

        if (!scene) {
          scene = await resolveSceneRepository(sceneRepository)
            .getPublishedById(pending.sceneVersionId);
        }
        if (!scene || scene.id !== pending.sceneVersionId) {
          throw new Error('pinned_scene_unavailable');
        }
        const draft = createTrainingDraft(userId, scene, result.sessionId, now());
        trainingDraftStore.save(draft);
        removePendingStart(userId, sceneSlug);
        startRequests.delete(requestKey);
        navigate(`/training/${result.sessionId}/safety-fact`, { replace: true });
      } catch {
        if (active) setState({ status: 'start-error' });
      }
    };

    void start();
    return () => {
      active = false;
    };
  }, [
    attempt,
    getCurrentUserId,
    navigate,
    now,
    runtimeRepository,
    sceneRepository,
    sceneSlug,
  ]);

  if (state.status === 'loading') {
    return (
      <RouteMessage
        heading="正在开始训练"
        message="正在核对场景和当前训练资格……"
        status="status"
      />
    );
  }
  if (state.status === 'missing') {
    return <RouteMessage heading="无法开始训练" message="没有找到这个场景。" />;
  }
  if (state.status === 'scene-error') {
    return (
      <RouteMessage
        heading="无法开始训练"
        message="场景加载失败，请检查网络后重试。"
        action={{
          label: '重试',
          run: () => {
            setState({ status: 'loading' });
            setAttempt((value) => value + 1);
          },
        }}
        secondaryAction={{
          label: '返回场景页',
          run: () => navigate('/scenes', { replace: true }),
        }}
      />
    );
  }
  if (state.status === 'start-error') {
    return (
      <RouteMessage
        heading="无法开始训练"
        message={discardContext
          ? '无法开始训练，当前请求编号会在重试时继续使用。'
          : '暂时无法核对当前账号或训练资格。'}
        action={{
          label: '重试',
          run: () => {
            setState({ status: 'loading' });
            setAttempt((value) => value + 1);
          },
        }}
        secondaryAction={{
          label: '放弃这次并返回场景',
          run: () => {
            if (discardContext) {
              removePendingStart(discardContext.userId, discardContext.slug);
              startRequests.delete(startRequestKey(
                discardContext.userId,
                discardContext.sceneVersionId,
                discardContext.requestId,
              ));
            }
            setDiscardContext(null);
            navigate('/scenes', { replace: true });
          },
        }}
      />
    );
  }
  return (
    <RouteMessage
      heading="本场景内容已更新"
      message="为避免混用版本，请返回场景页重新选择。"
    />
  );
}

export function TrainingSessionRoute({
  sceneRepository,
  runtimeRepository,
  progressRepository,
  getCurrentUserId = defaultCurrentUserId,
  now = systemNow,
  online,
}: TrainingRouteDependencies) {
  const { sessionId = '', step = '' } = useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'invalid-link' }
    | { status: 'missing-context' }
    | { status: 'network-error' }
    | { status: 'pending-completion-error' }
    | { status: 'completion-rejected' }
    | { status: 'content-update' }
    | { status: 'completion'; result: CompletionResult }
    | {
        status: 'ready';
        draft: ReturnType<typeof createTrainingDraft>;
        recoveryNotice?: string;
      }
  >({ status: 'loading' });

  useEffect(() => {
    let active = true;

    const recover = async () => {
      if (!uuidPattern.test(sessionId)
        || !ordinaryTrainingSteps.includes(step as typeof ordinaryTrainingSteps[number])) {
        if (active) setState({ status: 'invalid-link' });
        return;
      }

      let userId: string;
      try {
        userId = await getCurrentUserId();
      } catch {
        if (active) setState({ status: 'network-error' });
        return;
      }
      if (!active) return;
      if (!uuidPattern.test(userId)) {
        setState({ status: 'missing-context' });
        return;
      }

      const pendingCompletion = pendingCompletionStore.load(userId, sessionId);
      if (pendingCompletion) {
        try {
          const result = await resolveProgressRepository(progressRepository)
            .complete(pendingCompletion);
          if (!active) return;
          pendingCompletionStore.remove(userId, sessionId);
          trainingDraftStore.remove(userId, sessionId);
          setState({ status: 'completion', result });
        } catch (caught) {
          if (!active) return;
          const message = readErrorMessage(caught);
          if (message === 'session_not_completable') {
            try {
              const route = await resolveRuntimeRepository(runtimeRepository)
                .checkTrainingSession(sessionId);
              if (!active) return;
              if (route === 'safety-stop') {
                pendingCompletionStore.remove(userId, sessionId);
                trainingDraftStore.remove(userId, sessionId);
                saveSafetyContext(userId, sessionId, {
                  sceneVersionId: pendingCompletion.sceneVersionId,
                  source: 'server',
                });
                navigate(`/training/${sessionId}/safety-stop`, {
                  replace: true,
                });
              } else if (route === 'content-update') {
                pendingCompletionStore.remove(userId, sessionId);
                trainingDraftStore.remove(userId, sessionId);
                setState({ status: 'content-update' });
              } else if (route === 'continue') {
                pendingCompletionStore.remove(userId, sessionId);
                setState({ status: 'completion-rejected' });
              } else {
                setState({ status: 'pending-completion-error' });
              }
            } catch {
              if (active) setState({ status: 'pending-completion-error' });
            }
          } else if (message === 'cohort_context_ambiguous'
            || message === 'database_integrity_failure'
            || message === 'idempotency_conflict'
            || message === 'invalid_progress_request'
            || message === 'session_not_found'
            || message === 'unauthenticated') {
            pendingCompletionStore.remove(userId, sessionId);
            setState({ status: 'completion-rejected' });
          } else {
            setState({ status: 'pending-completion-error' });
          }
        }
        return;
      }

      const memory = trainingDraftStore.load(userId, sessionId, now());
      if (memory) {
        setState({ status: 'ready', draft: memory });
        return;
      }

      const envelope = loadRecoveryEnvelope(userId, sessionId, now());
      if (!envelope) {
        setState({ status: 'missing-context' });
        return;
      }

      try {
        const runtime = resolveRuntimeRepository(runtimeRepository);
        const route = await runtime.checkTrainingSession(sessionId);
        if (!active) return;
        if (route === 'content-update') {
          trainingDraftStore.remove(userId, sessionId);
          setState({ status: 'content-update' });
          return;
        }
        if (route === 'safety-stop') {
          saveSafetyContext(userId, sessionId, {
            sceneVersionId: envelope.sceneVersionId,
            source: 'server',
          });
          trainingDraftStore.remove(userId, sessionId);
          navigate(`/training/${sessionId}/safety-stop`, { replace: true });
          return;
        }
        if (route !== 'continue') throw new Error('invalid_training_route');

        const scene = await resolveSceneRepository(sceneRepository)
          .getPublishedById(envelope.sceneVersionId);
        if (!active) return;
        if (!scene || scene.id !== envelope.sceneVersionId || scene.riskLevel === 'stop') {
          trainingDraftStore.remove(userId, sessionId);
          setState({ status: 'missing-context' });
          return;
        }
        const draft = {
          ...createTrainingDraft(userId, scene, sessionId, now()),
          completionEventId: envelope.completionEventId,
          expiresAt: envelope.expiresAt,
        };
        trainingDraftStore.save(draft);
        setState({
          status: 'ready',
          draft,
          recoveryNotice: '为保护隐私，刚才的选择没有保存，请从安全确认重新开始。',
        });
        navigate(`/training/${sessionId}/safety-fact`, { replace: true });
      } catch {
        if (active) setState({ status: 'network-error' });
      }
    };

    void recover();
    return () => {
      active = false;
    };
  }, [
    attempt,
    getCurrentUserId,
    navigate,
    now,
    progressRepository,
    runtimeRepository,
    sceneRepository,
    sessionId,
    step,
  ]);

  if (state.status === 'ready') {
    return (
      <TrainingPage
        initialDraft={state.draft}
        runtimeRepository={resolveRuntimeRepository(runtimeRepository)}
        progressRepository={resolveProgressRepository(progressRepository)}
        online={online}
        now={now}
        recoveryNotice={state.recoveryNotice}
      />
    );
  }
  if (state.status === 'completion') {
    return (
      <main className="app-shell">
        <section className="surface training-shell">
          <CompletionPage result={state.result} />
        </section>
      </main>
    );
  }
  if (state.status === 'loading') {
    return (
      <RouteMessage
        heading="正在恢复练习"
        message="正在核对当前设备上的恢复信息……"
        status="status"
      />
    );
  }
  if (state.status === 'invalid-link') {
    return <RouteMessage heading="无法恢复练习" message="训练链接无效。" />;
  }
  if (state.status === 'missing-context') {
    return (
      <RouteMessage
        heading="无法恢复练习"
        message="无法恢复这次练习。请从当前设备的场景页重新进入，不会自动开始新训练。"
      />
    );
  }
  if (state.status === 'content-update') {
    return (
      <RouteMessage
        heading="本场景内容已更新"
        message="为避免混用不同版本，这次练习已停止。"
      />
    );
  }
  if (state.status === 'pending-completion-error') {
    return (
      <RouteMessage
        heading="完成记录尚未确认"
        message="完成记录尚未确认；重试会继续使用同一个记录编号，不会恢复或补写刚才的选择。"
        action={{
          label: '重试记录',
          run: () => {
            setState({ status: 'loading' });
            setAttempt((value) => value + 1);
          },
        }}
      />
    );
  }
  if (state.status === 'completion-rejected') {
    return (
      <RouteMessage
        heading="完成记录未通过核对"
        message="本页不会显示完成或奖励，请返回场景页重新开始。"
      />
    );
  }
  return (
    <RouteMessage
      heading="暂时无法恢复"
      message="暂时无法核对账号或恢复信息；重试不会清除当前会话中的恢复信封。"
      action={{
        label: '重试恢复',
        run: () => {
          setState({ status: 'loading' });
          setAttempt((value) => value + 1);
        },
      }}
    />
  );
}

export function TrainingSafetyRoute({
  sceneRepository,
  supportRepository,
  getCurrentUserId = defaultCurrentUserId,
}: TrainingRouteDependencies) {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const routeEpochRef = useRef(0);
  const manualStopInFlightRef = useRef<string | null>(null);
  const [state, setState] = useState<
    | { status: 'loading'; routeSessionId: string; epoch: number }
    | { status: 'invalid'; routeSessionId: string; epoch: number }
    | {
        status: 'retry-only';
        routeSessionId: string;
        epoch: number;
        ownerUserId: string;
        stopState: 'stopping' | 'confirmed' | 'unknown';
      }
    | {
        status: 'ready';
        routeSessionId: string;
        epoch: number;
        ownerUserId: string;
        context: NonNullable<ReturnType<typeof loadSafetyContext>>;
        scene: Awaited<ReturnType<SceneRepository['getPublishedById']>>;
        authoredUnavailable: boolean;
        stopState: 'stopping' | 'confirmed' | 'unknown';
      }
  >({ status: 'loading', routeSessionId: sessionId, epoch: 0 });

  useEffect(() => {
    let active = true;
    const epoch = routeEpochRef.current + 1;
    routeEpochRef.current = epoch;
    const isCurrentAttempt = () =>
      active && routeEpochRef.current === epoch;

    const load = async () => {
      if (!uuidPattern.test(sessionId)) {
        if (isCurrentAttempt()) {
          setState({
            status: 'invalid',
            routeSessionId: sessionId,
            epoch,
          });
        }
        return;
      }
      let ownerUserId: string;
      try {
        ownerUserId = await getCurrentUserId();
      } catch {
        if (isCurrentAttempt()) {
          setState({
            status: 'invalid',
            routeSessionId: sessionId,
            epoch,
          });
        }
        return;
      }
      if (!isCurrentAttempt() || !uuidPattern.test(ownerUserId)) {
        if (isCurrentAttempt()) {
          setState({
            status: 'invalid',
            routeSessionId: sessionId,
            epoch,
          });
        }
        return;
      }
      removeSafetyStateForOtherUsers(ownerUserId);
      const context = loadSafetyContext(ownerUserId, sessionId);
      const retryMarker = loadSafetyStopRetryMarker(ownerUserId, sessionId);
      if (!context && !retryMarker) {
        setState({
          status: 'invalid',
          routeSessionId: sessionId,
          epoch,
        });
        return;
      }
      if (!context) {
        setState({
          status: 'retry-only',
          routeSessionId: sessionId,
          epoch,
          ownerUserId,
          stopState: 'stopping',
        });
        try {
          await resolveSupportRepository(supportRepository)
            .stopTrainingForSafety(sessionId);
          removeSafetyStopRetryMarker(ownerUserId, sessionId);
          if (!isCurrentAttempt()) return;
          setState({
            status: 'retry-only',
            routeSessionId: sessionId,
            epoch,
            ownerUserId,
            stopState: 'confirmed',
          });
        } catch {
          if (!isCurrentAttempt()) return;
          setState({
            status: 'retry-only',
            routeSessionId: sessionId,
            epoch,
            ownerUserId,
            stopState: 'unknown',
          });
        }
        return;
      }
      const shouldStop = context.source === 'user' || retryMarker !== null;
      setState({
        status: 'ready',
        routeSessionId: sessionId,
        epoch,
        ownerUserId,
        context,
        scene: null,
        authoredUnavailable: false,
        stopState: shouldStop ? 'stopping' : 'confirmed',
      });

      void resolveSceneRepository(sceneRepository)
        .getPublishedById(context.sceneVersionId)
        .then((scene) => {
          if (!isCurrentAttempt()) return;
          setState((current) => current.status === 'ready'
            && current.routeSessionId === sessionId
            && current.epoch === epoch
            ? { ...current, scene, authoredUnavailable: false }
            : current);
        })
        .catch(() => {
          if (!isCurrentAttempt()) return;
          setState((current) => current.status === 'ready'
            && current.routeSessionId === sessionId
            && current.epoch === epoch
            ? { ...current, scene: null, authoredUnavailable: true }
            : current);
        });

      if (shouldStop) {
        saveSafetyStopRetryMarker(ownerUserId, sessionId);
        try {
          await resolveSupportRepository(supportRepository)
            .stopTrainingForSafety(sessionId);
          removeSafetyStopRetryMarker(ownerUserId, sessionId);
          if (!isCurrentAttempt()) return;
          setState((current) => current.status === 'ready'
            && current.routeSessionId === sessionId
            && current.epoch === epoch
            ? { ...current, stopState: 'confirmed' }
            : current);
        } catch {
          if (!isCurrentAttempt()) return;
          setState((current) => current.status === 'ready'
            && current.routeSessionId === sessionId
            && current.epoch === epoch
            ? { ...current, stopState: 'unknown' }
            : current);
        }
      }
    };

    void load();
    return () => {
      active = false;
      if (routeEpochRef.current === epoch) {
        routeEpochRef.current += 1;
      }
    };
  }, [getCurrentUserId, sceneRepository, sessionId, supportRepository]);

  const retryAuthored = () => {
    if (state.status !== 'ready'
      || state.routeSessionId !== sessionId
      || state.epoch !== routeEpochRef.current) return;
    const attemptSessionId = state.routeSessionId;
    const attemptEpoch = state.epoch;
    const sceneVersionId = state.context.sceneVersionId;
    setState({ ...state, authoredUnavailable: false });
    void resolveSceneRepository(sceneRepository)
      .getPublishedById(sceneVersionId)
      .then((scene) => {
        if (routeEpochRef.current !== attemptEpoch) return;
        setState((current) => current.status === 'ready'
          && current.routeSessionId === attemptSessionId
          && current.epoch === attemptEpoch
          ? { ...current, scene, authoredUnavailable: false }
          : current);
      })
      .catch(() => {
        if (routeEpochRef.current !== attemptEpoch) return;
        setState((current) => current.status === 'ready'
          && current.routeSessionId === attemptSessionId
          && current.epoch === attemptEpoch
          ? { ...current, scene: null, authoredUnavailable: true }
          : current);
      });
  };

  const retryStop = () => {
    if ((state.status !== 'ready' && state.status !== 'retry-only')
      || state.routeSessionId !== sessionId
      || state.epoch !== routeEpochRef.current) return;
    const ownerUserId = state.ownerUserId;
    const attemptSessionId = state.routeSessionId;
    const attemptEpoch = state.epoch;
    const attemptKey = `${ownerUserId}:${attemptSessionId}:${attemptEpoch}`;
    if (manualStopInFlightRef.current === attemptKey) return;
    manualStopInFlightRef.current = attemptKey;
    saveSafetyStopRetryMarker(ownerUserId, attemptSessionId);
    setState({ ...state, stopState: 'stopping' });
    const attempt = async () => {
      try {
        await resolveSupportRepository(supportRepository)
          .stopTrainingForSafety(attemptSessionId);
        removeSafetyStopRetryMarker(ownerUserId, attemptSessionId);
        if (routeEpochRef.current !== attemptEpoch) return;
        setState((current) => current.status === 'ready'
          || current.status === 'retry-only'
          ? current.routeSessionId === attemptSessionId
            && current.epoch === attemptEpoch
            ? { ...current, stopState: 'confirmed' }
            : current
          : current);
      } catch {
        if (routeEpochRef.current !== attemptEpoch) return;
        setState((current) => current.status === 'ready'
          || current.status === 'retry-only'
          ? current.routeSessionId === attemptSessionId
            && current.epoch === attemptEpoch
            ? { ...current, stopState: 'unknown' }
            : current
          : current);
      } finally {
        if (manualStopInFlightRef.current === attemptKey) {
          manualStopInFlightRef.current = null;
        }
      }
    };
    void attempt();
  };

  const stateMatchesRoute = state.routeSessionId === sessionId;
  if (!stateMatchesRoute || state.status === 'loading') {
    return (
      <RouteMessage
        heading="正在打开安全支持"
        message="普通训练保持停止。"
        status="status"
      />
    );
  }
  if (state.status === 'ready') {
    const boundSessionId = state.routeSessionId;
    return (
      <SafetyStopPage
        scene={state.scene}
        context={state.context}
        stopState={state.stopState}
        authoredUnavailable={state.authoredUnavailable}
        onRetryAuthored={retryAuthored}
        onRetryStop={retryStop}
        onExit={() => {
          removeSafetyContext(state.ownerUserId, boundSessionId);
          navigate('/scenes', { replace: true });
        }}
        onReportHandoff={() => {
          navigate(`/support/safety-report/${boundSessionId}`);
        }}
      />
    );
  }
  if (state.status === 'retry-only') {
    const unknown = state.stopState === 'unknown';
    return (
      <RouteMessage
        heading="优先保护你和相关人的安全"
        message={state.stopState === 'confirmed'
          ? '普通训练已停止。此设备已退出原报告上下文，不会恢复普通训练。'
          : state.stopState === 'stopping'
            ? '正在确认普通训练已停止；安全页面会保持打开。'
            : '停止结果尚无法确认，普通训练仍保持停止，不会恢复训练。'}
        status={unknown ? 'alert' : 'status'}
        action={{
          label: unknown ? '重试停止训练' : '查看通用安全支持',
          run: unknown
            ? retryStop
            : () => navigate('/support/safety-report'),
          disabled: state.stopState === 'stopping',
        }}
        secondaryAction={{
          label: unknown ? '查看通用安全支持' : '返回场景页',
          run: unknown
            ? () => navigate('/support/safety-report')
            : () => navigate('/scenes', { replace: true }),
        }}
      />
    );
  }
  return (
    <RouteMessage
      heading="优先保护你和相关人的安全"
      message="此设备没有可用的安全上下文。请联系当地紧急服务或可信任的人。"
    />
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  CompletionResult,
} from '../../domain/progress/types';
import { buildFeedback } from '../../domain/training/buildFeedback';
import {
  buildCompletionCommand,
  trainingReducer,
} from '../../domain/training/trainingReducer';
import type {
  CompletionCommand,
  EvidenceSelection,
  FirstThoughtSelection,
  TrainingDraft,
  TrainingStep,
} from '../../domain/training/types';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';
import type { TrainingRuntimeRepository } from '../../lib/repositories/TrainingRuntimeRepository';
import { CompletionPage } from '../progress/CompletionPage';
import { pendingCompletionStore } from '../progress/pendingCompletionStore';
import { EvidenceBoundaryStep } from './EvidenceBoundaryStep';
import { ExpressionActionStep } from './ExpressionActionStep';
import { FirstThoughtStep } from './FirstThoughtStep';
import { HypothesesStep } from './HypothesesStep';
import { OfflineBanner } from './OfflineBanner';
import { RelationshipForkStep } from './RelationshipForkStep';
import { SafetyFactStep } from './SafetyFactStep';
import {
  saveSafetyContext,
  trainingDraftStore,
} from './trainingDraftStore';
import { TrainingProgress } from './TrainingProgress';

type TrainingPageProps = {
  initialDraft: TrainingDraft;
  runtimeRepository: TrainingRuntimeRepository;
  progressRepository: ProgressRepository;
  online?: boolean;
  now?: () => Date;
  recoveryNotice?: string;
};

type PageView = 'training' | 'content-update' | 'routing-safety';
type ReducerAdvance = (current: TrainingDraft, at: string) => TrainingDraft;
type CompletionAttempt = {
  command: CompletionCommand;
  completedDraft: TrainingDraft;
};
type ConfirmedCompletion = CompletionAttempt & {
  result: CompletionResult;
};
const systemNow = () => new Date();
const stepHeadings: Record<TrainingStep, string> = {
  'safety-fact': '先只看发生了什么',
  'first-thought': '你的第一念是什么？',
  'relationship-fork': '这条关系回路可能怎样继续？',
  hypotheses: '至少保留两种解释',
  'evidence-boundary': '把事实、推测和边界分开',
  'expression-action': '把转念落到一个可控动作',
};
const completionIntegrityErrors = new Set([
  'cohort_context_ambiguous',
  'database_integrity_failure',
  'idempotency_conflict',
  'invalid_progress_request',
  'session_not_found',
  'unauthenticated',
]);

function readErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return '';
  }
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' ? message : '';
}

function useOnlineStatus(controlled: boolean | undefined): boolean {
  const [browserOnline, setBrowserOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));

  useEffect(() => {
    if (controlled !== undefined) return undefined;
    const update = () => setBrowserOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [controlled]);

  return controlled ?? browserOnline;
}

export function TrainingPage({
  initialDraft,
  runtimeRepository,
  progressRepository,
  online,
  now = systemNow,
  recoveryNotice,
}: TrainingPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus(online);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mountEpochCounterRef = useRef(0);
  const mountedEpochRef = useRef<number | null>(null);
  const operationCounterRef = useRef(0);
  const pendingOperationRef = useRef<{
    epoch: number;
    id: number;
  } | null>(null);
  const pauseSafetyTakeoverRef = useRef<{
    epoch: number;
    id: number;
  } | null>(null);
  const [draft, setDraft] = useState(() => (
    trainingDraftStore.load(
      initialDraft.userId,
      initialDraft.sessionId,
      now(),
    ) ?? initialDraft
  ));
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completionRejected, setCompletionRejected] = useState(false);
  const [view, setView] = useState<PageView>('training');
  const [completionAttempt, setCompletionAttempt] =
    useState<CompletionAttempt | null>(null);
  const [confirmedCompletion, setConfirmedCompletion] =
    useState<ConfirmedCompletion | null>(null);

  const replaceDraft = useCallback((next: TrainingDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const routeToSafety = useCallback((source: 'user' | 'server') => {
    const current = draftRef.current;
    if (source === 'server') {
      saveSafetyContext(current.sessionId, {
        sceneVersionId: current.scene.id,
        source: 'server',
      });
    }
    pendingCompletionStore.remove(current.userId, current.sessionId);
    trainingDraftStore.remove(current.userId, current.sessionId);
    setView('routing-safety');
    navigate(`/training/${current.sessionId}/safety-stop`, { replace: true });
  }, [navigate]);

  const routeCompletionRejection = useCallback(async (
    attempt: CompletionAttempt,
    operation: { epoch: number; id: number },
  ): Promise<boolean> => {
    try {
      const route = await runtimeRepository.checkTrainingSession(
        attempt.command.sessionId,
      );
      const isCurrentMount = mountedEpochRef.current === operation.epoch;
      const pauseMayTakeSafety = pauseSafetyTakeoverRef.current?.epoch
        === operation.epoch
        && pauseSafetyTakeoverRef.current.id === operation.id;
      if (!isCurrentMount
        && !(route === 'safety-stop' && pauseMayTakeSafety)) {
        return true;
      }
      if (route === 'safety-stop') {
        pendingCompletionStore.remove(
          draftRef.current.userId,
          attempt.command.sessionId,
        );
        setCompletionAttempt(null);
        routeToSafety('server');
        return true;
      }
      if (route === 'content-update') {
        pendingCompletionStore.remove(
          draftRef.current.userId,
          attempt.command.sessionId,
        );
        trainingDraftStore.remove(
          draftRef.current.userId,
          attempt.command.sessionId,
        );
        setCompletionAttempt(null);
        setView('content-update');
        return true;
      }
      if (route !== 'continue') throw new Error('invalid_training_route');
      pendingCompletionStore.remove(
        draftRef.current.userId,
        attempt.command.sessionId,
      );
      setCompletionAttempt(null);
      setCompletionRejected(true);
      setError('完成记录未通过核对，请返回场景页重新开始。');
      return true;
    } catch {
      if (mountedEpochRef.current === operation.epoch) {
        setCompletionAttempt(attempt);
        setError('完成记录尚未确认，请使用同一次记录重试。');
      }
      return false;
    }
  }, [routeToSafety, runtimeRepository]);

  const guardSession = useCallback(async (
    reduce?: ReducerAdvance,
  ): Promise<boolean> => {
    if (pendingOperationRef.current !== null || !isOnline) return false;
    const operation = {
      epoch: mountedEpochRef.current ?? mountEpochCounterRef.current,
      id: operationCounterRef.current + 1,
    };
    operationCounterRef.current = operation.id;
    pendingOperationRef.current = operation;
    setBusy(true);
    setError('');

    try {
      const current = draftRef.current;
      const route = await runtimeRepository.checkTrainingSession(current.sessionId);
      const isCurrentMount = mountedEpochRef.current === operation.epoch;
      const pauseMayTakeSafety = pauseSafetyTakeoverRef.current?.epoch === operation.epoch
        && pauseSafetyTakeoverRef.current.id === operation.id;
      if (!isCurrentMount && !(route === 'safety-stop' && pauseMayTakeSafety)) {
        return false;
      }
      if (route === 'safety-stop') {
        if (draftRef.current.status !== 'safety-stop') {
          routeToSafety('server');
        }
        return false;
      }
      if (route === 'content-update') {
        if (isCurrentMount && draftRef.current.status !== 'safety-stop') {
          trainingDraftStore.remove(current.userId, current.sessionId);
          setView('content-update');
        }
        return false;
      }
      if (route !== 'continue') throw new Error('invalid_training_route');
      if (!isCurrentMount || draftRef.current.status === 'safety-stop') {
        return false;
      }

      let active = current;
      const at = now().toISOString();
      if (active.status === 'paused') {
        active = trainingReducer(active, { type: 'resume', at });
      }
      const next = reduce ? reduce(active, at) : active;
      replaceDraft(next);

      if (next.status === 'completed') {
        trainingDraftStore.remove(next.userId, next.sessionId);
      } else {
        trainingDraftStore.save(next);
        if (reduce) navigate(`/training/${next.sessionId}/${next.step}`);
      }
      return true;
    } catch {
      if (mountedEpochRef.current === operation.epoch) {
        setError('网络连接出现问题，当前选择仍只保留在本页。');
      }
      return false;
    } finally {
      if (pendingOperationRef.current?.epoch === operation.epoch
        && pendingOperationRef.current.id === operation.id
        && mountedEpochRef.current === operation.epoch) {
        pendingOperationRef.current = null;
        setBusy(false);
      }
    }
  }, [
    isOnline,
    navigate,
    now,
    replaceDraft,
    routeToSafety,
    runtimeRepository,
  ]);

  const submitCompletion = useCallback(async (
    retryAttempt?: CompletionAttempt,
  ): Promise<void> => {
    if (pendingOperationRef.current !== null || !isOnline) return;
    const operation = {
      epoch: mountedEpochRef.current ?? mountEpochCounterRef.current,
      id: operationCounterRef.current + 1,
    };
    operationCounterRef.current = operation.id;
    pendingOperationRef.current = operation;
    setBusy(true);
    setError('');
    setCompletionRejected(false);

    let attempt = retryAttempt ?? completionAttempt ?? undefined;
    try {
      if (!attempt) {
        const current = draftRef.current;
        const route = await runtimeRepository.checkTrainingSession(
          current.sessionId,
        );
        const isCurrentMount = mountedEpochRef.current === operation.epoch;
        const pauseMayTakeSafety = pauseSafetyTakeoverRef.current?.epoch
          === operation.epoch
          && pauseSafetyTakeoverRef.current.id === operation.id;
        if (!isCurrentMount
          && !(route === 'safety-stop' && pauseMayTakeSafety)) {
          return;
        }
        if (route === 'safety-stop') {
          routeToSafety('server');
          return;
        }
        if (route === 'content-update') {
          trainingDraftStore.remove(current.userId, current.sessionId);
          setView('content-update');
          return;
        }
        if (route !== 'continue') throw new Error('invalid_training_route');
        if (draftRef.current.status !== 'active'
          && draftRef.current.status !== 'paused') {
          return;
        }

        const at = now().toISOString();
        const active = current.status === 'paused'
          ? trainingReducer(current, { type: 'resume', at })
          : current;
        const completedDraft = trainingReducer(active, {
          type: 'accept-expression-action',
          at,
        });
        attempt = {
          completedDraft,
          command: buildCompletionCommand(completedDraft),
        };
      }

      pendingCompletionStore.save(
        attempt.completedDraft.userId,
        attempt.command,
      );
      const result = await progressRepository.complete(attempt.command);
      if (mountedEpochRef.current !== operation.epoch
        || draftRef.current.status === 'paused'
        || draftRef.current.status === 'safety-stop') {
        return;
      }

      pendingCompletionStore.remove(
        attempt.completedDraft.userId,
        attempt.command.sessionId,
      );
      trainingDraftStore.remove(
        attempt.completedDraft.userId,
        attempt.command.sessionId,
      );
      setCompletionAttempt(null);
      setCompletionRejected(false);
      setConfirmedCompletion({ ...attempt, result });
    } catch (caught) {
      const message = readErrorMessage(caught);
      const isCurrentMount = mountedEpochRef.current === operation.epoch;
      const pauseMayRecheckSafety = pauseSafetyTakeoverRef.current?.epoch
        === operation.epoch
        && pauseSafetyTakeoverRef.current.id === operation.id;
      if ((!isCurrentMount
          && !(message === 'session_not_completable'
            && pauseMayRecheckSafety))
        || draftRef.current.status === 'safety-stop') {
        return;
      }
      if (!attempt) {
        if (isCurrentMount) {
          setError('网络连接出现问题，当前选择仍只保留在本页。');
        }
        return;
      }

      if (message === 'session_not_completable') {
        await routeCompletionRejection(attempt, operation);
        return;
      }
      if (completionIntegrityErrors.has(message)) {
        pendingCompletionStore.remove(
          attempt.completedDraft.userId,
          attempt.command.sessionId,
        );
        setCompletionAttempt(null);
        setCompletionRejected(true);
        setError('完成记录未通过核对，本页不会显示完成或奖励。');
        return;
      }

      setCompletionAttempt(attempt);
      setCompletionRejected(false);
      setError('完成记录尚未确认，请使用同一次记录重试。');
    } finally {
      if (pendingOperationRef.current?.epoch === operation.epoch
        && pendingOperationRef.current.id === operation.id
        && mountedEpochRef.current === operation.epoch) {
        pendingOperationRef.current = null;
        setBusy(false);
      }
    }
  }, [
    completionAttempt,
    isOnline,
    now,
    progressRepository,
    routeCompletionRejection,
    routeToSafety,
    runtimeRepository,
  ]);

  useEffect(() => {
    if (draft.status === 'active' || draft.status === 'paused') {
      trainingDraftStore.save(draft);
    }
  }, [draft]);

  const checkedOnPageLoad = useRef(false);
  useEffect(() => {
    const epoch = mountEpochCounterRef.current + 1;
    mountEpochCounterRef.current = epoch;
    mountedEpochRef.current = epoch;
    return () => {
      if (mountedEpochRef.current === epoch) {
        mountedEpochRef.current = null;
      }
      if (pendingOperationRef.current?.epoch === epoch) {
        pendingOperationRef.current = null;
      }
      checkedOnPageLoad.current = false;
    };
  }, []);

  const previousOnline = useRef(isOnline);
  useEffect(() => {
    if (!isOnline) {
      previousOnline.current = false;
      return;
    }
    if (!checkedOnPageLoad.current) {
      checkedOnPageLoad.current = true;
      previousOnline.current = true;
      void guardSession();
      return;
    }
    if (!previousOnline.current) void guardSession();
    previousOnline.current = isOnline;
  }, [guardSession, isOnline]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [confirmedCompletion, draft.status, draft.step, view]);

  useEffect(() => {
    if (view !== 'training'
      || location.pathname.endsWith('/safety-stop')
      || (draft.status !== 'active' && draft.status !== 'paused')) return;
    const expected = `/training/${draft.sessionId}/${draft.step}`;
    if (location.pathname.startsWith(`/training/${draft.sessionId}/`)
      && location.pathname !== expected) {
      navigate(expected, { replace: true });
    }
  }, [
    draft.sessionId,
    draft.status,
    draft.step,
    location.pathname,
    navigate,
    view,
  ]);

  const reportDanger = useCallback(() => {
    const current = draftRef.current;
    try {
      pauseSafetyTakeoverRef.current = null;
      pendingOperationRef.current = null;
      setBusy(false);
      pendingCompletionStore.remove(current.userId, current.sessionId);
      setCompletionAttempt(null);
      const safe = trainingReducer(current, {
        type: 'report-danger',
        signalCode: 'user_declared_danger',
        at: now().toISOString(),
      });
      saveSafetyContext(current.sessionId, {
        sceneVersionId: current.scene.id,
        source: 'user',
        signalCode: 'user_declared_danger',
      });
      replaceDraft(safe);
      routeToSafety('user');
    } catch {
      setError('无法进入普通训练，请退出并联系现实中的支持者。');
    }
  }, [now, replaceDraft, routeToSafety]);

  const pause = useCallback(() => {
    const current = draftRef.current;
    try {
      pauseSafetyTakeoverRef.current = pendingOperationRef.current;
      pendingOperationRef.current = null;
      setBusy(false);
      const paused = current.status === 'paused'
        ? current
        : trainingReducer(current, { type: 'pause', at: now().toISOString() });
      replaceDraft(paused);
      trainingDraftStore.save(paused);
      navigate('/scenes');
    } catch {
      setError('本次练习已失效，请返回场景页重新选择。');
    }
  }, [navigate, now, replaceDraft]);

  if (view === 'content-update') {
    return (
      <main className="app-shell">
        <section className="surface training-shell">
          <h1 ref={headingRef} tabIndex={-1}>本场景内容已更新</h1>
          <p role="alert">
            为避免混用不同版本，这次练习已停止。你可以回到场景页重新开始。
          </p>
          <a className="primary-action" href="/scenes">返回场景页</a>
        </section>
      </main>
    );
  }

  if (view === 'routing-safety' || draft.status === 'safety-stop') {
    return (
      <main className="app-shell">
        <section className="surface training-shell">
          <h1 ref={headingRef} tabIndex={-1}>正在转到安全支持</h1>
          <p role="status">普通训练已经停止。</p>
        </section>
      </main>
    );
  }

  const disabled = busy
    || !isOnline
    || completionAttempt !== null
    || completionRejected;
  const feedback = confirmedCompletion
    ? buildFeedback(
      confirmedCompletion.completedDraft.scene,
      confirmedCompletion.completedDraft,
    )
    : null;
  const currentHeading = confirmedCompletion
    ? '转念一刻'
    : stepHeadings[draft.step];

  return (
    <main className="app-shell">
      <section className="surface training-shell">
        <TrainingProgress step={draft.step} heading={currentHeading} />
        {recoveryNotice && <p className="privacy-recovery" role="status">{recoveryNotice}</p>}
        {!isOnline && <OfflineBanner />}
        {error && (
          <div className="training-error" role="alert">
            <p>{error}</p>
            {completionRejected ? (
              <a className="secondary-action" href="/scenes">返回场景页</a>
            ) : (
              <button
                type="button"
                className="secondary-action"
                disabled={!isOnline || busy}
                onClick={() => {
                  if (completionAttempt) {
                    void submitCompletion(completionAttempt);
                  } else {
                    void guardSession();
                  }
                }}
              >
                {completionAttempt ? '重试记录' : '重试连接'}
              </button>
            )}
          </div>
        )}

        {confirmedCompletion ? (
          <CompletionPage
            result={confirmedCompletion.result}
            feedback={feedback ?? undefined}
            headingRef={headingRef}
          />
        ) : (
          <>
            {draft.step === 'safety-fact' && (
              <SafetyFactStep
                scene={draft.scene}
                headingRef={headingRef}
                disabled={disabled}
                onContinue={() => void guardSession((current, at) => (
                  trainingReducer(current, { type: 'confirm-safe-facts', at })
                ))}
              />
            )}
            {draft.step === 'first-thought' && (
              <FirstThoughtStep
                scene={draft.scene}
                headingRef={headingRef}
                disabled={disabled}
                onPause={pause}
                onContinue={(value: FirstThoughtSelection) => {
                  void guardSession((current, at) => trainingReducer(current, {
                    type: 'choose-first-thought',
                    value,
                    at,
                  }));
                }}
              />
            )}
            {draft.step === 'relationship-fork' && (
              <RelationshipForkStep
                scene={draft.scene}
                headingRef={headingRef}
                disabled={disabled}
                onContinue={(response) => {
                  void guardSession((current, at) => trainingReducer(current, {
                    type: 'choose-prediction',
                    response,
                    at,
                  }));
                }}
              />
            )}
            {draft.step === 'hypotheses' && (
              <HypothesesStep
                scene={draft.scene}
                headingRef={headingRef}
                disabled={disabled}
                onContinue={(hypothesisIds) => {
                  void guardSession((current, at) => trainingReducer(current, {
                    type: 'choose-hypotheses',
                    hypothesisIds,
                    at,
                  }));
                }}
              />
            )}
            {draft.step === 'evidence-boundary' && (
              <EvidenceBoundaryStep
                headingRef={headingRef}
                disabled={disabled}
                onDanger={reportDanger}
                onContinue={(value: EvidenceSelection) => {
                  void guardSession((current, at) => trainingReducer(current, {
                    type: 'confirm-evidence',
                    value,
                    at,
                  }));
                }}
              />
            )}
            {draft.step === 'expression-action' && (
              <ExpressionActionStep
                scene={draft.scene}
                headingRef={headingRef}
                disabled={disabled}
                onComplete={() => {
                  void submitCompletion();
                }}
              />
            )}
          </>
        )}

        {!confirmedCompletion && (
          <div className="training-exits" aria-label="随时可用的退出方式">
            <button
              type="button"
              className="danger-action"
              onClick={reportDanger}
            >
              这里存在伤害或危险
            </button>
            <button type="button" className="secondary-action" onClick={pause}>
              暂时离开
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trainingReducer } from '../../domain/training/trainingReducer';
import type {
  TrainingAction,
  TrainingDraft,
  TrainingStep,
} from '../../domain/training/types';
import type { ProgressRepository } from '../../lib/repositories/ProgressRepository';
import type { TrainingRuntimeRepository } from '../../lib/repositories/TrainingRuntimeRepository';
import {
  actionTimes,
  baseTrainingDraft,
  reduceTraining,
  validEvidence,
} from '../../test/fixtures/training';
import { pendingCompletionStore } from '../progress/pendingCompletionStore';
import { trainingDraftStore } from './trainingDraftStore';
import { TrainingPage } from './TrainingPage';

const now = new Date('2026-07-22T12:10:00.000Z');

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current path">{location.pathname}</output>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>浏览器返回</button>;
}

const runtimeWith = (
  route: 'continue' | 'content-update' | 'safety-stop' = 'continue',
): TrainingRuntimeRepository => ({
  startTraining: vi.fn(async () => ({
    sessionId: baseTrainingDraft().sessionId,
    route,
  })),
  checkTrainingSession: vi.fn(async () => route),
});

const progressWith = (
  complete: ProgressRepository['complete'] = vi.fn(async () => ({
    completionId: '55555555-5555-4555-8555-555555555555',
    awarded: true as const,
    pointsDelta: 10 as const,
  })),
): ProgressRepository => ({
  complete,
  saveReview: vi.fn(),
  setSaved: vi.fn(),
  listSaved: vi.fn(async () => []),
  getPendingReview: vi.fn(async () => null),
  getPrivateProgress: vi.fn(),
});

function renderTraining(
  draft: TrainingDraft,
  options: {
    runtime?: TrainingRuntimeRepository;
    progress?: ProgressRepository;
    online?: boolean;
  } = {},
) {
  const runtime = options.runtime ?? runtimeWith();
  const progress = options.progress ?? progressWith();
  render(
    <MemoryRouter initialEntries={[
      `/training/${draft.sessionId}/${draft.step}`,
    ]}>
      <TrainingPage
        initialDraft={draft}
        runtimeRepository={runtime}
        progressRepository={progress}
        online={options.online ?? true}
        now={() => now}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
  return runtime;
}

function renderRoutedTraining(
  draft: TrainingDraft,
  runtime: TrainingRuntimeRepository,
  progress: ProgressRepository,
) {
  render(
    <MemoryRouter initialEntries={[
      '/outside',
      `/training/${draft.sessionId}/${draft.step}`,
    ]} initialIndex={1}>
      <Routes>
        <Route
          path="/training/:sessionId/:step"
          element={(
            <TrainingPage
              initialDraft={draft}
              runtimeRepository={runtime}
              progressRepository={progress}
              online
              now={() => now}
            />
          )}
        />
        <Route path="/scenes" element={<h1>场景页</h1>} />
        <Route path="/outside" element={<h1>外部页</h1>} />
        <Route
          path="/training/:sessionId/safety-stop"
          element={<h1>安全支持页</h1>}
        />
      </Routes>
      <BackButton />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function chooseFirstThought(
  user: ReturnType<typeof userEvent.setup>,
  label = '他根本没把我的话当回事',
) {
  await user.click(screen.getByRole('radio', { name: label }));
  await user.click(screen.getByRole('button', { name: '继续' }));
}

async function choosePrediction(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: '争辩或反抗' }));
  await user.click(screen.getByRole('button', { name: '继续' }));
}

async function chooseHypotheses(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /保护一天里少有的自主时间/ }));
  await user.click(screen.getByRole('checkbox', { name: /缺少从娱乐切换到任务的能力/ }));
  await user.click(screen.getByRole('button', { name: '继续' }));
}

async function chooseEvidence(
  user: ReturnType<typeof userEvent.setup>,
  dangerLabel = '目前没有发现威胁、控制或伤害',
) {
  await user.click(screen.getByRole('radio', { name: '反复发生' }));
  await user.click(screen.getByRole('radio', { name: '我掌握了一些明确事实' }));
  await user.click(screen.getByRole('radio', { name: '其中有我的推测' }));
  await user.click(screen.getByRole('radio', { name: dangerLabel }));
  if (dangerLabel === '存在威胁、控制或伤害') return;
  await user.click(screen.getByRole('radio', { name: '可以先解决一部分' }));
  await user.click(screen.getByRole('radio', { name: '先设边界' }));
  await user.click(screen.getByRole('button', { name: '继续' }));
}

function expressionDraft(): TrainingDraft {
  return reduceTraining(baseTrainingDraft(), [
    { type: 'confirm-safe-facts', at: actionTimes.facts },
    {
      type: 'choose-first-thought',
      value: { kind: 'option', optionId: 'disrespect' },
      at: actionTimes.thought,
    },
    {
      type: 'choose-prediction',
      response: '争辩或反抗',
      at: actionTimes.prediction,
    },
    {
      type: 'choose-hypotheses',
      hypothesisIds: ['rule-boundary', 'need-autonomy'],
      at: actionTimes.hypotheses,
    },
    {
      type: 'confirm-evidence',
      value: validEvidence,
      at: actionTimes.evidence,
    },
  ]);
}

async function tabTo(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
) {
  for (let index = 0; index < 40 && !target.matches(':focus'); index += 1) {
    await user.tab();
  }
  expect(target).toHaveFocus();
}

describe('TrainingPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    trainingDraftStore.removeAllFromMemory();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('drives the real six-screen reducer journey and replaces screen six with feedback', async () => {
    const user = userEvent.setup();
    const complete = vi.fn(async () => ({
      completionId: '55555555-5555-4555-8555-555555555555',
      awarded: true as const,
      pointsDelta: 10 as const,
    }));
    const runtime = renderTraining(baseTrainingDraft(), {
      progress: progressWith(complete),
    });

    const firstProgress = screen.getByText('第 1 步，共 6 步');
    expect(firstProgress).toHaveAttribute('aria-live', 'polite');
    expect(firstProgress).toHaveTextContent('先只看发生了什么');
    expect(screen.getByRole('heading', { name: '先只看发生了什么' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '继续' }));

    const secondProgress = await screen.findByText('第 2 步，共 6 步');
    expect(secondProgress).toHaveTextContent('你的第一念是什么？');
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '你的第一念是什么？' })).toHaveFocus();
    await chooseFirstThought(user);

    expect(screen.getByText('第 3 步，共 6 步')).toBeInTheDocument();
    await choosePrediction(user);

    expect(screen.getByText('第 4 步，共 6 步')).toBeInTheDocument();
    expect(screen.getAllByText('一种需要验证的可能')).toHaveLength(3);
    expect(screen.getByText('还可能看见的特点或品格种子')).toBeInTheDocument();
    const continueButton = screen.getByRole('button', { name: '继续' });
    await user.click(screen.getByRole('checkbox', { name: /保护一天里少有的自主时间/ }));
    expect(continueButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /缺少从娱乐切换到任务的能力/ }));
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(screen.getByText('第 5 步，共 6 步')).toBeInTheDocument();
    const evidenceContinue = screen.getByRole('button', { name: '继续' });
    await user.click(screen.getByRole('radio', { name: '反复发生' }));
    await user.click(screen.getByRole('radio', { name: '我掌握了一些明确事实' }));
    await user.click(screen.getByRole('radio', { name: '其中有我的推测' }));
    await user.click(screen.getByRole('radio', { name: '目前没有发现威胁、控制或伤害' }));
    await user.click(screen.getByRole('radio', { name: '可以先解决一部分' }));
    expect(evidenceContinue).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '先设边界' }));
    expect(evidenceContinue).toBeEnabled();
    await user.click(evidenceContinue);

    expect(screen.getByText('第 6 步，共 6 步')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '完成这次练习' }));

    expect(await screen.findByRole('heading', { name: '转念一刻' })).toHaveFocus();
    expect(screen.getByText('第 6 步，共 6 步')).toHaveTextContent('转念一刻');
    expect(screen.getByText('刚才的第一念 → 可能的情绪/语言/行动/关系回路')).toBeInTheDocument();
    expect(screen.getByText('事实没有改变，但我多了两种解释和一个可控动作')).toBeInTheDocument();
    expect(screen.getByText('愤怒')).toBeInTheDocument();
    expect(screen.getByText('理解自主需要不等于允许无限使用，也不取消共同确认的规则。')).toBeInTheDocument();
    expect(screen.queryByText('第 7 步')).not.toBeInTheDocument();
    expect(runtime.checkTrainingSession).toHaveBeenCalledTimes(7);
    expect(complete).toHaveBeenCalledWith({
      eventId: baseTrainingDraft().completionEventId,
      sessionId: baseTrainingDraft().sessionId,
      sceneId: baseTrainingDraft().scene.sceneId,
      sceneVersionId: baseTrainingDraft().scene.id,
      completedAt: now.toISOString(),
    });
    expect(screen.getByText('训练完成，获得 10 点转念力'))
      .toHaveAttribute('role', 'status');
    expect(trainingDraftStore.load(baseTrainingDraft().userId, baseTrainingDraft().sessionId))
      .toBeNull();
  });

  it('hides all success feedback until completion is confirmed and retries the same command', async () => {
    const user = userEvent.setup();
    let rejectFirst!: (reason: Error) => void;
    const first = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const complete = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({
        completionId: '55555555-5555-4555-8555-555555555555',
        awarded: false,
        pointsDelta: 0,
      });
    const draft = expressionDraft();
    renderTraining(draft, { progress: progressWith(complete) });

    const completeButton = await screen.findByRole('button', {
      name: '完成这次练习',
    });
    await waitFor(() => expect(completeButton).toBeEnabled());
    await user.click(completeButton);

    expect(screen.queryByRole('heading', { name: '转念一刻' }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/训练完成|获得\s*10/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '把转念落到一个可控动作' }))
      .toBeInTheDocument();

    rejectFirst(new Error('response lost'));
    expect(await screen.findByRole('alert')).toHaveTextContent('完成记录尚未确认');
    expect(screen.queryByRole('heading', { name: '转念一刻' }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/训练完成|获得\s*10/)).not.toBeInTheDocument();

    const raw = sessionStorage.getItem(
      `turning-mind:pending-completion:v1:${draft.userId}:${draft.sessionId}`,
    );
    expect(JSON.parse(raw!)).toEqual({
      userId: draft.userId,
      eventId: draft.completionEventId,
      sessionId: draft.sessionId,
      sceneId: draft.scene.sceneId,
      sceneVersionId: draft.scene.id,
      completedAt: now.toISOString(),
    });
    expect(raw).not.toContain('firstThought');
    expect(raw).not.toContain('hypotheses');
    expect(screen.getByRole('button', { name: '完成这次练习' }))
      .toBeDisabled();

    await user.click(screen.getByRole('button', { name: '重试记录' }));
    expect(await screen.findByRole('heading', { name: '转念一刻' }))
      .toBeInTheDocument();
    expect(screen.getByText('完成已记录')).toHaveAttribute('role', 'status');
    expect(screen.queryByText(/训练完成|获得\s*10/)).not.toBeInTheDocument();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]).toEqual(complete.mock.calls[0]);
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)).toBeNull();
  });

  it('lets danger take over an in-flight completion and permanently clears its retry command', async () => {
    const user = userEvent.setup();
    let rejectCompletion!: (reason: Error) => void;
    const complete = vi.fn(() => new Promise<never>((_resolve, reject) => {
      rejectCompletion = reject;
    }));
    const draft = expressionDraft();
    renderTraining(draft, { progress: progressWith(complete) });

    const button = await screen.findByRole('button', { name: '完成这次练习' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => {
      expect(pendingCompletionStore.load(draft.userId, draft.sessionId))
        .not.toBeNull();
    });

    await user.click(screen.getByRole('button', {
      name: '这里存在伤害或危险',
    }));
    expect(screen.getByLabelText('current path')).toHaveTextContent(
      `/training/${draft.sessionId}/safety-stop`,
    );
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();

    rejectCompletion(new Error('response lost'));
    await waitFor(() => {
      expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();
    });
    expect(screen.getByRole('heading', { name: '正在转到安全支持' }))
      .toBeInTheDocument();
    expect(screen.queryByText(/训练完成|完成已记录|获得\s*10|转念一刻/))
      .not.toBeInTheDocument();
  });

  it('rechecks a deterministic non-completable response and replaces with safety', async () => {
    const user = userEvent.setup();
    const checkTrainingSession = vi.fn()
      .mockResolvedValueOnce('continue')
      .mockResolvedValueOnce('continue')
      .mockResolvedValueOnce('safety-stop');
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession,
    };
    const complete = vi.fn(async () => {
      throw new Error('session_not_completable');
    });
    const draft = expressionDraft();
    renderTraining(draft, {
      runtime,
      progress: progressWith(complete),
    });

    const button = await screen.findByRole('button', { name: '完成这次练习' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent(
        `/training/${draft.sessionId}/safety-stop`,
      );
    });
    expect(screen.queryByText(/训练完成|完成已记录|获得\s*10/))
      .not.toBeInTheDocument();
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();
  });

  it('lets pause hand an unresolved completion precheck to a server safety-stop', async () => {
    const user = userEvent.setup();
    let resolvePrecheck!: (value: 'safety-stop') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolvePrecheck = resolve;
        })),
    };
    const complete = vi.fn(async () => ({
      completionId: '55555555-5555-4555-8555-555555555555',
      awarded: true as const,
      pointsDelta: 10 as const,
    }));
    const draft = expressionDraft();
    trainingDraftStore.save(draft);
    renderRoutedTraining(draft, runtime, progressWith(complete));

    const completeButton = await screen.findByRole('button', {
      name: '完成这次练习',
    });
    await waitFor(() => expect(completeButton).toBeEnabled());
    await user.click(completeButton);
    await waitFor(() => {
      expect(runtime.checkTrainingSession).toHaveBeenCalledTimes(2);
    });

    await user.click(screen.getByRole('button', { name: '暂时离开' }));
    expect(screen.getByRole('heading', { name: '场景页' })).toBeInTheDocument();
    resolvePrecheck('safety-stop');

    expect(await screen.findByRole('heading', { name: '安全支持页' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('current path')).toHaveTextContent(
      `/training/${draft.sessionId}/safety-stop`,
    );
    expect(complete).not.toHaveBeenCalled();
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)).toBeNull();
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .toContain('"source":"server"');
    expect(screen.queryByText(/训练完成|完成已记录|获得\s*10|转念一刻/))
      .not.toBeInTheDocument();
  });

  it('lets pause hand a non-completable recheck to a server safety-stop', async () => {
    const user = userEvent.setup();
    let resolveRecheck!: (value: 'safety-stop') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockResolvedValueOnce('continue')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveRecheck = resolve;
        })),
    };
    const complete = vi.fn(async () => {
      throw new Error('session_not_completable');
    });
    const draft = expressionDraft();
    trainingDraftStore.save(draft);
    renderRoutedTraining(draft, runtime, progressWith(complete));

    const completeButton = await screen.findByRole('button', {
      name: '完成这次练习',
    });
    await waitFor(() => expect(completeButton).toBeEnabled());
    await user.click(completeButton);
    await waitFor(() => {
      expect(runtime.checkTrainingSession).toHaveBeenCalledTimes(3);
    });
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId))
      .not.toBeNull();

    await user.click(screen.getByRole('button', { name: '暂时离开' }));
    expect(screen.getByRole('heading', { name: '场景页' })).toBeInTheDocument();
    resolveRecheck('safety-stop');

    expect(await screen.findByRole('heading', { name: '安全支持页' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('current path')).toHaveTextContent(
      `/training/${draft.sessionId}/safety-stop`,
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)).toBeNull();
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .toContain('"source":"server"');
    expect(screen.queryByText(/训练完成|完成已记录|获得\s*10|转念一刻/))
      .not.toBeInTheDocument();
  });

  it('does not apply completion precheck safety after an unrelated external unmount', async () => {
    const user = userEvent.setup();
    let resolvePrecheck!: (value: 'safety-stop') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolvePrecheck = resolve;
        })),
    };
    const complete = vi.fn(async () => ({
      completionId: '55555555-5555-4555-8555-555555555555',
      awarded: true as const,
      pointsDelta: 10 as const,
    }));
    const draft = expressionDraft();
    trainingDraftStore.save(draft);
    renderRoutedTraining(draft, runtime, progressWith(complete));

    const completeButton = await screen.findByRole('button', {
      name: '完成这次练习',
    });
    await waitFor(() => expect(completeButton).toBeEnabled());
    await user.click(completeButton);
    await waitFor(() => {
      expect(runtime.checkTrainingSession).toHaveBeenCalledTimes(2);
    });
    await user.click(screen.getByRole('button', { name: '浏览器返回' }));
    expect(screen.getByRole('heading', { name: '外部页' })).toBeInTheDocument();

    await act(async () => {
      resolvePrecheck('safety-stop');
    });

    expect(screen.getByRole('heading', { name: '外部页' })).toBeInTheDocument();
    expect(screen.getByLabelText('current path')).toHaveTextContent('/outside');
    expect(complete).not.toHaveBeenCalled();
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)?.status)
      .toBe('active');
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .toBeNull();
  });

  it('does not apply completion recheck safety after an unrelated external unmount', async () => {
    const user = userEvent.setup();
    let resolveRecheck!: (value: 'safety-stop') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockResolvedValueOnce('continue')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveRecheck = resolve;
        })),
    };
    const complete = vi.fn(async () => {
      throw new Error('session_not_completable');
    });
    const draft = expressionDraft();
    trainingDraftStore.save(draft);
    renderRoutedTraining(draft, runtime, progressWith(complete));

    const completeButton = await screen.findByRole('button', {
      name: '完成这次练习',
    });
    await waitFor(() => expect(completeButton).toBeEnabled());
    await user.click(completeButton);
    await waitFor(() => {
      expect(runtime.checkTrainingSession).toHaveBeenCalledTimes(3);
    });
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId))
      .not.toBeNull();
    await user.click(screen.getByRole('button', { name: '浏览器返回' }));
    expect(screen.getByRole('heading', { name: '外部页' })).toBeInTheDocument();

    await act(async () => {
      resolveRecheck('safety-stop');
    });

    expect(screen.getByRole('heading', { name: '外部页' })).toBeInTheDocument();
    expect(screen.getByLabelText('current path')).toHaveTextContent('/outside');
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)?.status)
      .toBe('active');
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId))
      .not.toBeNull();
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .toBeNull();
  });

  it.each([
    'cohort_context_ambiguous',
    'database_integrity_failure',
  ])('treats %s as a deterministic non-celebratory rejection', async (errorName) => {
    const user = userEvent.setup();
    const complete = vi.fn(async () => {
      throw new Error(errorName);
    });
    const draft = expressionDraft();
    renderTraining(draft, { progress: progressWith(complete) });

    const button = await screen.findByRole('button', { name: '完成这次练习' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '完成记录未通过核对',
    );
    expect(screen.queryByText(/训练完成|完成已记录|获得\s*10|转念一刻/))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试记录' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试连接' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回场景页' }))
      .toHaveAttribute('href', '/scenes');
    expect(pendingCompletionStore.load(draft.userId, draft.sessionId)).toBeNull();
  });

  it.each([
    '不确定',
    '多个都可能',
    '以上都不符合',
  ])(
    'does not invent a thought path when the participant chooses %s',
    async (label) => {
      const user = userEvent.setup();
      renderTraining(baseTrainingDraft());
      await user.click(screen.getByRole('button', { name: '继续' }));
      await chooseFirstThought(user, label);
      await choosePrediction(user);
      await chooseHypotheses(user);
      await chooseEvidence(user);
      await user.click(screen.getByRole('button', { name: '完成这次练习' }));

      expect(await screen.findByRole('heading', { name: '转念一刻' })).toBeInTheDocument();
      expect(screen.getByText(/你选择暂不下结论/)).toBeInTheDocument();
      expect(screen.queryByText('愤怒')).not.toBeInTheDocument();
      expect(screen.queryByText('你说话从来不算数')).not.toBeInTheDocument();
      expect(screen.queryByText('立即夺走手机')).not.toBeInTheDocument();
    },
  );

  it('offers one native first-thought radio group plus separate pause and danger actions', async () => {
    const draft = trainingReducer(baseTrainingDraft(), {
      type: 'confirm-safe-facts',
      at: actionTimes.facts,
    });
    renderTraining(draft);

    const group = screen.getByRole('group', { name: '你的第一念更接近哪一句？' });
    expect(within(group).getAllByRole('radio')).toHaveLength(6);
    expect(within(group).getByRole('radio', { name: '不确定' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: '多个都可能' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: '以上都不符合' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我现在不适合继续' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '这里存在伤害或危险' })).toBeInTheDocument();
  });

  it('immediately hard-stops from danger evidence without rendering expression', async () => {
    const user = userEvent.setup();
    const draft = reduceTraining(baseTrainingDraft(), [
      { type: 'confirm-safe-facts', at: actionTimes.facts },
      {
        type: 'choose-first-thought',
        value: { kind: 'option', optionId: 'disrespect' },
        at: actionTimes.thought,
      },
      {
        type: 'choose-prediction',
        response: '争辩或反抗',
        at: actionTimes.prediction,
      },
      {
        type: 'choose-hypotheses',
        hypothesisIds: ['need-autonomy', 'transition-skill'],
        at: actionTimes.hypotheses,
      },
    ]);
    trainingDraftStore.save(draft);
    renderTraining(draft);

    await chooseEvidence(user, '存在威胁、控制或伤害');

    await waitFor(() => {
      expect(screen.getByLabelText('current path'))
        .toHaveTextContent(`/training/${draft.sessionId}/safety-stop`);
    });
    expect(screen.queryByText(draft.scene.newExpression!)).not.toBeInTheDocument();
    expect(trainingDraftStore.load(draft.userId, draft.sessionId)).toBeNull();
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .not.toMatch(/他根本没把我的话当回事|争辩或反抗|need-autonomy/);
  });

  it.each([
    ['safety-fact', []],
    ['first-thought', [{ type: 'confirm-safe-facts', at: actionTimes.facts }]],
    ['relationship-fork', [
      { type: 'confirm-safe-facts', at: actionTimes.facts },
      { type: 'choose-first-thought', value: { kind: 'uncertain' }, at: actionTimes.thought },
    ]],
    ['hypotheses', [
      { type: 'confirm-safe-facts', at: actionTimes.facts },
      { type: 'choose-first-thought', value: { kind: 'uncertain' }, at: actionTimes.thought },
      { type: 'choose-prediction', response: '争辩或反抗', at: actionTimes.prediction },
    ]],
    ['evidence-boundary', [
      { type: 'confirm-safe-facts', at: actionTimes.facts },
      { type: 'choose-first-thought', value: { kind: 'uncertain' }, at: actionTimes.thought },
      { type: 'choose-prediction', response: '争辩或反抗', at: actionTimes.prediction },
      {
        type: 'choose-hypotheses',
        hypothesisIds: ['need-autonomy', 'transition-skill'],
        at: actionTimes.hypotheses,
      },
    ]],
    ['expression-action', [
      { type: 'confirm-safe-facts', at: actionTimes.facts },
      { type: 'choose-first-thought', value: { kind: 'uncertain' }, at: actionTimes.thought },
      { type: 'choose-prediction', response: '争辩或反抗', at: actionTimes.prediction },
      {
        type: 'choose-hypotheses',
        hypothesisIds: ['need-autonomy', 'transition-skill'],
        at: actionTimes.hypotheses,
      },
      { type: 'confirm-evidence', value: validEvidence, at: actionTimes.evidence },
    ]],
  ] satisfies Array<[TrainingStep, TrainingAction[]]>)(
    'hard-stops with replace navigation from %s',
    async (_step, actions) => {
      const user = userEvent.setup();
      const draft = reduceTraining(baseTrainingDraft(), actions);
      renderTraining(draft);

      await user.click(screen.getByRole('button', { name: '这里存在伤害或危险' }));

      await waitFor(() => {
        expect(screen.getByLabelText('current path'))
          .toHaveTextContent(`/training/${draft.sessionId}/safety-stop`);
      });
    },
  );

  it('allows a paused draft to hard-stop', async () => {
    const user = userEvent.setup();
    const draft = trainingReducer(baseTrainingDraft(), {
      type: 'pause',
      at: actionTimes.facts,
    });
    renderTraining(draft);

    await user.click(screen.getByRole('button', { name: '这里存在伤害或危险' }));
    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent('safety-stop');
    });
  });

  it('disables ordinary progress offline while keeping danger and pause available', () => {
    renderTraining(baseTrainingDraft(), { online: false });

    expect(screen.getByText('当前离线，选择只保留在当前页面，网络恢复后可继续。'))
      .toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: '继续' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '这里存在伤害或危险' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '暂时离开' })).toBeEnabled();
  });

  it('preserves state and offers an accessible retry when a session check fails', async () => {
    const user = userEvent.setup();
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue('continue'),
    };
    renderTraining(baseTrainingDraft(), { runtime });

    await screen.findByRole('heading', { name: '先只看发生了什么' });
    await user.click(screen.getByRole('button', { name: '继续' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接出现问题');
    expect(screen.getByText('第 1 步，共 6 步')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试连接' }));
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(await screen.findByText('第 2 步，共 6 步')).toBeInTheDocument();
  });

  it('clears ordinary state for content update and server safety-stop routes', async () => {
    const user = userEvent.setup();
    const contentRuntime = runtimeWith('content-update');
    const firstDraft = baseTrainingDraft();
    trainingDraftStore.save(firstDraft);
    renderTraining(firstDraft, { runtime: contentRuntime });

    expect(await screen.findByRole('heading', { name: '本场景内容已更新' }))
      .toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('这次练习已停止');
    expect(trainingDraftStore.load(firstDraft.userId, firstDraft.sessionId)).toBeNull();

    cleanup();
    const secondDraft = {
      ...baseTrainingDraft(),
      sessionId: '40000000-0000-4000-8000-000000000002',
    };
    trainingDraftStore.save(secondDraft);
    renderTraining(secondDraft, { runtime: runtimeWith('safety-stop') });

    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent('safety-stop');
    });
    expect(sessionStorage.getItem(`turning-mind:safety:${secondDraft.sessionId}`))
      .toContain('"source":"server"');
    expect(user).toBeDefined();
  });

  it('locks rapid double clicks so one reducer transition occurs', async () => {
    const user = userEvent.setup();
    let resolveCheck!: (value: 'continue') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveCheck = resolve;
        })),
    };
    renderTraining(baseTrainingDraft(), { runtime });
    await screen.findByRole('heading', { name: '先只看发生了什么' });

    const advance = screen.getByRole('button', { name: '继续' });
    await user.dblClick(advance);
    expect(runtime.checkTrainingSession).toHaveBeenCalledTimes(2);
    resolveCheck('continue');

    expect(await screen.findByText('第 2 步，共 6 步')).toBeInTheDocument();
  });

  it('never reopens ordinary training when a pending check resolves after danger', async () => {
    const user = userEvent.setup();
    let resolveCheck!: (value: 'continue') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn(() => new Promise<'continue'>((resolve) => {
        resolveCheck = resolve;
      })),
    };
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);
    renderTraining(draft, { runtime });

    await user.click(screen.getByRole('button', { name: '这里存在伤害或危险' }));
    expect(screen.getByLabelText('current path')).toHaveTextContent('safety-stop');
    resolveCheck('continue');

    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent('safety-stop');
    });
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)).toBeNull();
    expect(sessionStorage.getItem(
      `turning-mind:draft:${draft.userId}:${draft.sessionId}`,
    )).toBeNull();
  });

  it('keeps a server safety-stop when it arrives after the participant pauses', async () => {
    const user = userEvent.setup();
    let resolveCheck!: (value: 'safety-stop') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn(() => new Promise<'safety-stop'>((resolve) => {
        resolveCheck = resolve;
      })),
    };
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);
    renderTraining(draft, { runtime });

    await user.click(screen.getByRole('button', { name: '暂时离开' }));
    expect(screen.getByLabelText('current path')).toHaveTextContent('/scenes');
    resolveCheck('safety-stop');

    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent('safety-stop');
    });
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)).toBeNull();
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .toContain('"source":"server"');
  });

  it('does not write or navigate ordinary progress after the page unmounts', async () => {
    const user = userEvent.setup();
    let resolveAdvance!: (value: 'continue') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveAdvance = resolve;
        })),
    };
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);

    render(
      <MemoryRouter initialEntries={[
        '/scenes',
        `/training/${draft.sessionId}/safety-fact`,
      ]} initialIndex={1}>
        <Routes>
          <Route
            path="/training/:sessionId/:step"
            element={(
              <TrainingPage
                initialDraft={draft}
                runtimeRepository={runtime}
                progressRepository={progressWith()}
                online
                now={() => now}
              />
            )}
          />
          <Route path="/scenes" element={<h1>场景页</h1>} />
        </Routes>
        <BackButton />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '继续' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '继续' }));
    await user.click(screen.getByRole('button', { name: '浏览器返回' }));
    expect(screen.getByRole('heading', { name: '场景页' })).toBeInTheDocument();
    resolveAdvance('continue');

    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent('/scenes');
    });
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)?.step)
      .toBe('safety-fact');
  });

  it('does not apply a server route after an unrelated external unmount', async () => {
    const user = userEvent.setup();
    let resolveAdvance!: (value: 'safety-stop') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn()
        .mockResolvedValueOnce('continue')
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveAdvance = resolve;
        })),
    };
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);

    render(
      <MemoryRouter initialEntries={[
        '/scenes',
        `/training/${draft.sessionId}/safety-fact`,
      ]} initialIndex={1}>
        <Routes>
          <Route
            path="/training/:sessionId/:step"
            element={(
              <TrainingPage
                initialDraft={draft}
                runtimeRepository={runtime}
                progressRepository={progressWith()}
                online
                now={() => now}
              />
            )}
          />
          <Route path="/scenes" element={<h1>场景页</h1>} />
        </Routes>
        <BackButton />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '继续' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: '继续' }));
    await user.click(screen.getByRole('button', { name: '浏览器返回' }));
    expect(screen.getByRole('heading', { name: '场景页' })).toBeInTheDocument();
    resolveAdvance('safety-stop');

    await waitFor(() => {
      expect(screen.getByLabelText('current path')).toHaveTextContent('/scenes');
    });
    expect(trainingDraftStore.load(draft.userId, draft.sessionId, now)?.step)
      .toBe('safety-fact');
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .toBeNull();
  });

  it('supports a keyboard-only six-screen journey with named fieldsets', async () => {
    const user = userEvent.setup();
    renderTraining(baseTrainingDraft());

    const firstContinue = screen.getByRole('button', { name: '继续' });
    await waitFor(() => expect(firstContinue).toBeEnabled());
    await tabTo(user, firstContinue);
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('group', {
      name: '你的第一念更接近哪一句？',
    })).toBeInTheDocument();
    const thought = screen.getByRole('radio', {
      name: '他根本没把我的话当回事',
    });
    await tabTo(user, thought);
    await user.keyboard(' ');
    await tabTo(user, screen.getByRole('button', { name: '继续' }));
    await user.keyboard('{Enter}');

    const predictionGroup = await screen.findByRole('group', {
      name: '对方接下来可能有什么反应？',
    });
    expect(predictionGroup).toBeInTheDocument();
    const prediction = screen.getByRole('radio', { name: '争辩或反抗' });
    await tabTo(user, prediction);
    await user.keyboard(' ');
    await tabTo(user, screen.getByRole('button', { name: '继续' }));
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('group', {
      name: '选择至少两种彼此竞争的可能',
    })).toBeInTheDocument();
    const firstHypothesis = screen.getByRole('checkbox', {
      name: /保护一天里少有的自主时间/,
    });
    const secondHypothesis = screen.getByRole('checkbox', {
      name: /缺少从娱乐切换到任务的能力/,
    });
    await tabTo(user, firstHypothesis);
    await user.keyboard(' ');
    await tabTo(user, secondHypothesis);
    await user.keyboard(' ');
    await tabTo(user, screen.getByRole('button', { name: '继续' }));
    await user.keyboard('{Enter}');

    const evidenceGroups = [
      ['这件事发生的频率', '反复发生'],
      ['已经掌握的事实', '我掌握了一些明确事实'],
      ['事实与推测', '其中有我的推测'],
      ['安全情况', '目前没有发现威胁、控制或伤害'],
      ['可以直接处理多少', '可以先解决一部分'],
      ['下一步最需要什么', '先设边界'],
    ] as const;
    for (const [legend, label] of evidenceGroups) {
      expect(await screen.findByRole('group', { name: legend })).toBeInTheDocument();
      const radio = screen.getByRole('radio', { name: label });
      await tabTo(user, radio);
      await user.keyboard(' ');
    }
    await tabTo(user, screen.getByRole('button', { name: '继续' }));
    await user.keyboard('{Enter}');

    const complete = await screen.findByRole('button', { name: '完成这次练习' });
    await tabTo(user, complete);
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: '转念一刻' })).toHaveFocus();
    expect(screen.getByText('事实没有改变，但我多了两种解释和一个可控动作'))
      .toBeInTheDocument();
  });

  it('rechecks on reconnect before enabling ordinary advance', async () => {
    let resolveReconnect!: (value: 'continue') => void;
    const runtime: TrainingRuntimeRepository = {
      startTraining: vi.fn(),
      checkTrainingSession: vi.fn(() => new Promise<'continue'>((resolve) => {
        resolveReconnect = resolve;
      })),
    };
    const draft = baseTrainingDraft();
    const view = render(
      <MemoryRouter initialEntries={[
        `/training/${draft.sessionId}/safety-fact`,
      ]}>
        <TrainingPage
          initialDraft={draft}
          runtimeRepository={runtime}
          progressRepository={progressWith()}
          online={false}
          now={() => now}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '继续' })).toBeDisabled();
    view.rerender(
      <MemoryRouter initialEntries={[
        `/training/${draft.sessionId}/safety-fact`,
      ]}>
        <TrainingPage
          initialDraft={draft}
          runtimeRepository={runtime}
          progressRepository={progressWith()}
          online
          now={() => now}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(runtime.checkTrainingSession).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '继续' })).toBeDisabled();
    resolveReconnect('continue');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '继续' })).toBeEnabled();
    });
    expect(screen.getByText('第 1 步，共 6 步')).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { validPublishedScene } from '../../test/fixtures/scene';
import {
  actionTimes,
  baseTrainingDraft,
  completedTrainingDraft,
  trainingNow,
  validEvidence,
} from '../../test/fixtures/training';
import {
  buildCompletionCommand,
  createTrainingDraft,
  trainingReducer,
} from './trainingReducer';
import {
  ordinaryTrainingSteps,
  routeSafetySignal,
  type SafetySignalCode,
  type TrainingAction,
  type TrainingDraft,
  type TrainingStep,
} from './types';

const safetySignals = [
  'physical_or_sexual_violence',
  'serious_threat',
  'coercive_control',
  'child_abuse_or_exploitation',
  'self_harm_or_suicide',
  'bullying_or_retaliation',
  'medical_emergency',
  'user_declared_danger',
] satisfies SafetySignalCode[];

const ordinaryActions: Record<TrainingStep, TrainingAction> = {
  'safety-fact': {
    type: 'confirm-safe-facts',
    at: actionTimes.facts,
  },
  'first-thought': {
    type: 'choose-first-thought',
    value: { kind: 'option', optionId: 'disrespect' },
    at: actionTimes.thought,
  },
  'relationship-fork': {
    type: 'choose-prediction',
    response: '争辩或反抗',
    at: actionTimes.prediction,
  },
  hypotheses: {
    type: 'choose-hypotheses',
    hypothesisIds: ['need-autonomy', 'rule-boundary'],
    at: actionTimes.hypotheses,
  },
  'evidence-boundary': {
    type: 'confirm-evidence',
    value: validEvidence,
    at: actionTimes.evidence,
  },
  'expression-action': {
    type: 'accept-expression-action',
    at: actionTimes.completion,
  },
};

function statesAtEveryStep(): Record<TrainingStep, TrainingDraft> {
  const states = {} as Record<TrainingStep, TrainingDraft>;
  let state = baseTrainingDraft();
  for (const step of ordinaryTrainingSteps) {
    states[step] = state;
    state = trainingReducer(state, ordinaryActions[step]);
  }
  return states;
}

describe('trainingReducer', () => {
  it('defines the exact bounded six-step order', () => {
    expect(ordinaryTrainingSteps).toEqual([
      'safety-fact',
      'first-thought',
      'relationship-fork',
      'hypotheses',
      'evidence-boundary',
      'expression-action',
    ]);
  });

  it('creates an ordinary draft pinned for 24 hours and rejects stop cards', () => {
    const draft = baseTrainingDraft();

    expect(draft).toMatchObject({
      schemaVersion: 1,
      sessionId: '40000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000101',
      scene: validPublishedScene,
      step: 'safety-fact',
      status: 'active',
      selectedHypothesisIds: [],
      expressionAccepted: false,
      updatedAt: trainingNow.toISOString(),
      expiresAt: '2026-07-23T12:00:00.000Z',
    });
    expect(() => createTrainingDraft(
      draft.userId,
      { ...validPublishedScene, riskLevel: 'stop' },
      draft.sessionId,
      trainingNow,
    )).toThrow('ordinary_training_unavailable');
  });

  it('accepts every valid ordinary transition and stamps only the supplied time', () => {
    const states = statesAtEveryStep();

    expect(states['first-thought'].updatedAt).toBe(actionTimes.facts);
    expect(states['relationship-fork']).toMatchObject({
      firstThought: { kind: 'option', optionId: 'disrespect' },
      updatedAt: actionTimes.thought,
    });
    expect(states.hypotheses).toMatchObject({
      predictedResponse: '争辩或反抗',
      updatedAt: actionTimes.prediction,
    });
    expect(states['evidence-boundary']).toMatchObject({
      selectedHypothesisIds: ['need-autonomy', 'rule-boundary'],
      updatedAt: actionTimes.hypotheses,
    });
    expect(states['expression-action']).toMatchObject({
      evidence: validEvidence,
      updatedAt: actionTimes.evidence,
    });
    expect(completedTrainingDraft()).toMatchObject({
      status: 'completed',
      expressionAccepted: true,
      updatedAt: actionTimes.completion,
    });
  });

  it('rejects every ordinary action from every out-of-order step without mutation', () => {
    const states = statesAtEveryStep();

    for (const currentStep of ordinaryTrainingSteps) {
      for (const actionStep of ordinaryTrainingSteps) {
        if (currentStep === actionStep) continue;
        const state = states[currentStep];
        const snapshot = structuredClone(state);
        expect(
          () => trainingReducer(state, ordinaryActions[actionStep]),
          `${actionStep} must reject at ${currentStep}`,
        ).toThrow('invalid_transition');
        expect(state).toEqual(snapshot);
      }
    }
  });

  it('is immutable and deterministic for an identical state, action, and timestamp', () => {
    const state = baseTrainingDraft();
    const snapshot = structuredClone(state);
    const action = ordinaryActions['safety-fact'];

    const first = trainingReducer(state, action);
    const replay = trainingReducer(state, structuredClone(action));

    expect(first).toEqual(replay);
    expect(first).not.toBe(state);
    expect(state).toEqual(snapshot);
  });

  it('pauses and resumes without losing the confirmed step or values', () => {
    const selected = trainingReducer(
      statesAtEveryStep()['first-thought'],
      ordinaryActions['first-thought'],
    );
    const paused = trainingReducer(selected, {
      type: 'pause',
      at: '2026-07-22T12:02:30.000Z',
    });
    const resumed = trainingReducer(paused, {
      type: 'resume',
      at: '2026-07-22T12:02:40.000Z',
    });

    expect(paused).toMatchObject({
      status: 'paused',
      step: 'relationship-fork',
      firstThought: selected.firstThought,
      updatedAt: '2026-07-22T12:02:30.000Z',
    });
    expect(resumed).toMatchObject({
      status: 'active',
      step: 'relationship-fork',
      firstThought: selected.firstThought,
      updatedAt: '2026-07-22T12:02:40.000Z',
    });
  });

  it('rejects ordinary work when paused or expired', () => {
    const paused = trainingReducer(baseTrainingDraft(), {
      type: 'pause',
      at: actionTimes.facts,
    });

    expect(() => trainingReducer(paused, {
      type: 'confirm-safe-facts',
      at: actionTimes.thought,
    })).toThrow('session_not_active');
    expect(() => trainingReducer(baseTrainingDraft(), {
      type: 'confirm-safe-facts',
      at: '2026-07-23T12:00:00.000Z',
    })).toThrow('session_expired');
    expect(() => trainingReducer({
      ...paused,
      expiresAt: '2026-07-22T12:01:30.000Z',
    }, {
      type: 'resume',
      at: actionTimes.thought,
    })).toThrow('session_expired');
  });

  it('rejects stale ordinary, pause, and resume action times', () => {
    expect(() => trainingReducer(baseTrainingDraft(), {
      type: 'confirm-safe-facts',
      at: '2026-07-22T11:59:00.000Z',
    })).toThrow('invalid_action_time');
    expect(() => trainingReducer(baseTrainingDraft(), {
      type: 'pause',
      at: '2026-07-22T11:59:00.000Z',
    })).toThrow('invalid_action_time');

    const paused = trainingReducer(baseTrainingDraft(), {
      type: 'pause',
      at: actionTimes.facts,
    });
    expect(() => trainingReducer(paused, {
      type: 'resume',
      at: trainingNow.toISOString(),
    })).toThrow('invalid_action_time');
  });

  it('cannot complete with a timestamp earlier than the prior confirmation', () => {
    const expressionStep = statesAtEveryStep()['expression-action'];

    expect(() => trainingReducer(expressionStep, {
      type: 'accept-expression-action',
      at: actionTimes.hypotheses,
    })).toThrow('invalid_action_time');
  });

  it.each(['completed', 'safety-stop'] as const)(
    'keeps %s terminal against pause, resume, ordinary work, and danger reports',
    (status) => {
      const state = status === 'completed'
        ? completedTrainingDraft()
        : trainingReducer(baseTrainingDraft(), {
          type: 'report-danger',
          signalCode: 'user_declared_danger',
          at: actionTimes.facts,
        });
      const actions: TrainingAction[] = [
        { type: 'pause', at: '2026-07-22T12:07:00.000Z' },
        { type: 'resume', at: '2026-07-22T12:07:00.000Z' },
        {
          type: 'report-danger',
          signalCode: 'serious_threat',
          at: '2026-07-22T12:07:00.000Z',
        },
        { type: 'confirm-safe-facts', at: '2026-07-22T12:07:00.000Z' },
      ];

      for (const action of actions) {
        expect(() => trainingReducer(state, action)).toThrow('session_terminal');
      }
    },
  );

  it.each(safetySignals)('routes %s to safety-stop', (signalCode) => {
    expect(routeSafetySignal(signalCode)).toBe('safety-stop');
  });

  it('accepts every safety signal from every ordinary step and from paused', () => {
    const candidateStates = [
      ...Object.values(statesAtEveryStep()),
      trainingReducer(baseTrainingDraft(), {
        type: 'pause',
        at: actionTimes.facts,
      }),
    ];

    for (const state of candidateStates) {
      for (const signalCode of safetySignals) {
        const next = trainingReducer(state, {
          type: 'report-danger',
          signalCode,
          at: '2026-07-22T12:07:00.000Z',
        });
        expect(next).toMatchObject({
          status: 'safety-stop',
          safetySignalCode: signalCode,
        });
      }
    }
  });

  it('scrubs ordinary selections when danger is reported', () => {
    const selected = statesAtEveryStep()['evidence-boundary'];
    const stopped = trainingReducer(selected, {
      type: 'report-danger',
      signalCode: 'coercive_control',
      at: actionTimes.evidence,
    });

    expect(stopped).toMatchObject({
      status: 'safety-stop',
      safetySignalCode: 'coercive_control',
      selectedHypothesisIds: [],
      expressionAccepted: false,
      updatedAt: actionTimes.evidence,
    });
    expect(stopped).not.toHaveProperty('firstThought');
    expect(stopped).not.toHaveProperty('predictedResponse');
    expect(stopped).not.toHaveProperty('evidence');
  });

  it('never blocks a stale danger report and never rolls updatedAt backward', () => {
    const selected = statesAtEveryStep()['evidence-boundary'];
    const stopped = trainingReducer(selected, {
      type: 'report-danger',
      signalCode: 'serious_threat',
      at: trainingNow.toISOString(),
    });

    expect(stopped).toMatchObject({
      status: 'safety-stop',
      safetySignalCode: 'serious_threat',
      updatedAt: selected.updatedAt,
    });
  });

  it('routes present danger evidence to safety before expression and scrubs answers', () => {
    const state = statesAtEveryStep()['evidence-boundary'];
    const stopped = trainingReducer(state, {
      type: 'confirm-evidence',
      value: { ...validEvidence, danger: 'present' },
      at: actionTimes.evidence,
    });

    expect(stopped).toMatchObject({
      status: 'safety-stop',
      step: 'evidence-boundary',
      safetySignalCode: 'user_declared_danger',
      selectedHypothesisIds: [],
      expressionAccepted: false,
    });
    expect(stopped).not.toHaveProperty('firstThought');
    expect(stopped).not.toHaveProperty('predictedResponse');
    expect(stopped).not.toHaveProperty('evidence');
  });

  it('never blocks stale danger evidence and never rolls updatedAt backward', () => {
    const state = statesAtEveryStep()['evidence-boundary'];
    const stopped = trainingReducer(state, {
      type: 'confirm-evidence',
      value: { ...validEvidence, danger: 'present' },
      at: trainingNow.toISOString(),
    });

    expect(stopped).toMatchObject({
      status: 'safety-stop',
      safetySignalCode: 'user_declared_danger',
      updatedAt: state.updatedAt,
    });
  });

  it.each([
    [
      'unknown option',
      statesAtEveryStep()['first-thought'],
      {
        type: 'choose-first-thought',
        value: { kind: 'option', optionId: 'forged' },
        at: actionTimes.thought,
      },
      'invalid_first_thought',
    ],
    [
      'forged selection kind',
      statesAtEveryStep()['first-thought'],
      {
        type: 'choose-first-thought',
        value: { kind: 'correct-answer' },
        at: actionTimes.thought,
      } as unknown as TrainingAction,
      'invalid_first_thought',
    ],
    [
      'unknown prediction',
      statesAtEveryStep()['relationship-fork'],
      {
        type: 'choose-prediction',
        response: '平台替用户编造的走向',
        at: actionTimes.prediction,
      },
      'invalid_prediction',
    ],
    [
      'duplicate hypotheses',
      statesAtEveryStep().hypotheses,
      {
        type: 'choose-hypotheses',
        hypothesisIds: ['need-autonomy', 'need-autonomy'],
        at: actionTimes.hypotheses,
      },
      'two_unique_hypotheses_required',
    ],
    [
      'unknown hypothesis',
      statesAtEveryStep().hypotheses,
      {
        type: 'choose-hypotheses',
        hypothesisIds: ['need-autonomy', 'forged'],
        at: actionTimes.hypotheses,
      },
      'invalid_hypothesis',
    ],
    [
      'forged evidence enum',
      statesAtEveryStep()['evidence-boundary'],
      {
        type: 'confirm-evidence',
        value: { ...validEvidence, danger: 'definitely-safe' },
        at: actionTimes.evidence,
      } as unknown as TrainingAction,
      'invalid_evidence',
    ],
  ])('rejects %s even when static typing is bypassed', (_case, state, action, error) => {
    expect(() => trainingReducer(
      state as TrainingDraft,
      action as TrainingAction,
    )).toThrow(error as string);
  });

  it('rejects malformed action timestamps instead of reading the clock', () => {
    expect(() => trainingReducer(baseTrainingDraft(), {
      type: 'confirm-safe-facts',
      at: 'now',
    })).toThrow('invalid_action_time');
  });
});

describe('buildCompletionCommand', () => {
  it('returns exactly the five-key privacy shape with acceptance time', () => {
    expect(buildCompletionCommand(completedTrainingDraft())).toEqual({
      eventId: '50000000-0000-4000-8000-000000000001',
      sessionId: '40000000-0000-4000-8000-000000000001',
      sceneId: '20000000-0000-0000-0000-000000000001',
      sceneVersionId: '10000000-0000-0000-0000-000000000001',
      completedAt: actionTimes.completion,
    });
  });

  it('serializes no participant answer, safety, or authored-answer content', () => {
    const serialized = JSON.stringify(buildCompletionCommand(completedTrainingDraft()));

    for (const privateValue of [
      '00000000-0000-4000-8000-000000000101',
      'disrespect',
      '争辩或反抗',
      'need-autonomy',
      'repeated',
      'coercive_control',
      validPublishedScene.newExpression!,
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it('rejects incomplete and safety-stopped drafts', () => {
    expect(() => buildCompletionCommand(baseTrainingDraft())).toThrow(
      'training_not_complete',
    );
    expect(() => buildCompletionCommand(trainingReducer(baseTrainingDraft(), {
      type: 'report-danger',
      signalCode: 'user_declared_danger',
      at: actionTimes.facts,
    }))).toThrow('training_not_complete');
  });
});

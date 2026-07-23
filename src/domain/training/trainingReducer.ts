import type { PublishedSceneVersion } from '../scenes/types';
import {
  routeSafetySignal,
  type CompletionCommand,
  type EvidenceSelection,
  type FirstThoughtSelection,
  type SafetySignalCode,
  type TrainingAction,
  type TrainingDraft,
} from './types';

const safetySignals = new Set<SafetySignalCode>([
  'physical_or_sexual_violence',
  'serious_threat',
  'coercive_control',
  'child_abuse_or_exploitation',
  'self_harm_or_suicide',
  'bullying_or_retaliation',
  'medical_emergency',
  'user_declared_danger',
]);

const evidenceValues = {
  recurrence: new Set(['once', 'repeated', 'unknown']),
  knownFacts: new Set(['clear', 'partial', 'none-yet']),
  assumptions: new Set(['present', 'none-known', 'uncertain']),
  danger: new Set(['none-known', 'uncertain', 'present']),
  directlySolvable: new Set(['yes', 'partly', 'no', 'unknown']),
  nextNeed: new Set(['stabilize', 'verify', 'solve', 'boundary', 'help']),
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function readActionTime(at: unknown): string {
  if (typeof at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)
    || Number.isNaN(Date.parse(at))
    || new Date(at).toISOString() !== at) {
    throw new Error('invalid_action_time');
  }
  return at;
}

function assertNotExpired(state: TrainingDraft, at: string): void {
  if (Date.parse(at) >= Date.parse(state.expiresAt)) {
    throw new Error('session_expired');
  }
}

function assertChronological(state: TrainingDraft, at: string): void {
  if (Date.parse(at) < Date.parse(state.updatedAt)) {
    throw new Error('invalid_action_time');
  }
}

function assertOrdinaryTime(state: TrainingDraft, at: string): void {
  assertChronological(state, at);
  assertNotExpired(state, at);
}

function safetyTimestamp(state: TrainingDraft, at: string): string {
  return Date.parse(at) < Date.parse(state.updatedAt) ? state.updatedAt : at;
}

function readFirstThought(
  value: unknown,
  scene: PublishedSceneVersion,
): FirstThoughtSelection {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new Error('invalid_first_thought');
  }
  if (value.kind === 'option') {
    if (!hasExactKeys(value, ['kind', 'optionId'])
      || typeof value.optionId !== 'string'
      || !scene.thoughtOptions.some((option) => option.id === value.optionId)) {
      throw new Error('invalid_first_thought');
    }
    return { kind: 'option', optionId: value.optionId };
  }
  if (!['uncertain', 'multiple', 'none'].includes(value.kind)
    || !hasExactKeys(value, ['kind'])) {
    throw new Error('invalid_first_thought');
  }
  return { kind: value.kind } as FirstThoughtSelection;
}

function readHypothesisIds(value: unknown, scene: PublishedSceneVersion): string[] {
  if (!Array.isArray(value)
    || value.length < 2
    || !value.every((id) => typeof id === 'string')
    || new Set(value).size !== value.length) {
    throw new Error('two_unique_hypotheses_required');
  }
  const authoredIds = new Set(scene.hypotheses.map((item) => item.id));
  if (!value.every((id) => authoredIds.has(id))) {
    throw new Error('invalid_hypothesis');
  }
  return [...value];
}

function readEvidence(value: unknown): EvidenceSelection {
  const keys = [
    'recurrence',
    'knownFacts',
    'assumptions',
    'danger',
    'directlySolvable',
    'nextNeed',
  ];
  if (!isRecord(value)
    || !hasExactKeys(value, keys)
    || !evidenceValues.recurrence.has(value.recurrence as never)
    || !evidenceValues.knownFacts.has(value.knownFacts as never)
    || !evidenceValues.assumptions.has(value.assumptions as never)
    || !evidenceValues.danger.has(value.danger as never)
    || !evidenceValues.directlySolvable.has(value.directlySolvable as never)
    || !evidenceValues.nextNeed.has(value.nextNeed as never)) {
    throw new Error('invalid_evidence');
  }
  return {
    recurrence: value.recurrence as EvidenceSelection['recurrence'],
    knownFacts: value.knownFacts as EvidenceSelection['knownFacts'],
    assumptions: value.assumptions as EvidenceSelection['assumptions'],
    danger: value.danger as EvidenceSelection['danger'],
    directlySolvable: value.directlySolvable as EvidenceSelection['directlySolvable'],
    nextNeed: value.nextNeed as EvidenceSelection['nextNeed'],
  };
}

function toSafetyStop(
  state: TrainingDraft,
  signalCode: SafetySignalCode,
  at: string,
): TrainingDraft {
  const safeState: TrainingDraft = {
    ...state,
    status: routeSafetySignal(signalCode),
    selectedHypothesisIds: [],
    expressionAccepted: false,
    safetySignalCode: signalCode,
    updatedAt: at,
  };
  delete safeState.firstThought;
  delete safeState.predictedResponse;
  delete safeState.evidence;
  return safeState;
}

export function createTrainingDraft(
  userId: string,
  scene: PublishedSceneVersion,
  sessionId: string,
  now: Date,
): TrainingDraft {
  if (scene.riskLevel === 'stop') {
    throw new Error('ordinary_training_unavailable');
  }
  const startedAt = now.toISOString();
  return {
    schemaVersion: 1,
    sessionId,
    userId,
    completionEventId: globalThis.crypto.randomUUID(),
    scene,
    step: 'safety-fact',
    status: 'active',
    selectedHypothesisIds: [],
    expressionAccepted: false,
    updatedAt: startedAt,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
  };
}

export function trainingReducer(
  state: TrainingDraft,
  action: TrainingAction,
): TrainingDraft {
  if (state.status === 'completed' || state.status === 'safety-stop') {
    throw new Error('session_terminal');
  }

  const at = readActionTime(action.at);

  if (action.type === 'report-danger') {
    if (!safetySignals.has(action.signalCode)) {
      throw new Error('invalid_safety_signal');
    }
    return toSafetyStop(
      state,
      action.signalCode,
      safetyTimestamp(state, at),
    );
  }

  if (action.type === 'resume') {
    if (state.status !== 'paused') throw new Error('session_not_paused');
    assertOrdinaryTime(state, at);
    return { ...state, status: 'active', updatedAt: at };
  }

  if (state.status !== 'active') {
    throw new Error('session_not_active');
  }

  if (action.type === 'pause') {
    assertOrdinaryTime(state, at);
    return { ...state, status: 'paused', updatedAt: at };
  }

  switch (action.type) {
    case 'confirm-safe-facts':
      if (state.step !== 'safety-fact') throw new Error('invalid_transition');
      assertOrdinaryTime(state, at);
      return { ...state, step: 'first-thought', updatedAt: at };

    case 'choose-first-thought': {
      if (state.step !== 'first-thought') throw new Error('invalid_transition');
      const firstThought = readFirstThought(action.value, state.scene);
      assertOrdinaryTime(state, at);
      return {
        ...state,
        firstThought,
        step: 'relationship-fork',
        updatedAt: at,
      };
    }

    case 'choose-prediction':
      if (state.step !== 'relationship-fork') throw new Error('invalid_transition');
      if (typeof action.response !== 'string'
        || !state.scene.predictionOptions.includes(action.response)) {
        throw new Error('invalid_prediction');
      }
      assertOrdinaryTime(state, at);
      return {
        ...state,
        predictedResponse: action.response,
        step: 'hypotheses',
        updatedAt: at,
      };

    case 'choose-hypotheses': {
      if (state.step !== 'hypotheses') throw new Error('invalid_transition');
      const selectedHypothesisIds = readHypothesisIds(
        action.hypothesisIds,
        state.scene,
      );
      assertOrdinaryTime(state, at);
      return {
        ...state,
        selectedHypothesisIds,
        step: 'evidence-boundary',
        updatedAt: at,
      };
    }

    case 'confirm-evidence': {
      if (state.step !== 'evidence-boundary') throw new Error('invalid_transition');
      const evidence = readEvidence(action.value);
      if (evidence.danger === 'present') {
        return toSafetyStop(
          state,
          'user_declared_danger',
          safetyTimestamp(state, at),
        );
      }
      assertOrdinaryTime(state, at);
      return {
        ...state,
        evidence,
        step: 'expression-action',
        updatedAt: at,
      };
    }

    case 'accept-expression-action':
      if (state.step !== 'expression-action' || !state.evidence) {
        throw new Error('invalid_transition');
      }
      assertOrdinaryTime(state, at);
      return {
        ...state,
        expressionAccepted: true,
        status: 'completed',
        updatedAt: at,
      };

    default:
      throw new Error('invalid_action');
  }
}

export function buildCompletionCommand(
  state: TrainingDraft,
): CompletionCommand {
  if (state.status !== 'completed' || !state.expressionAccepted) {
    throw new Error('training_not_complete');
  }
  return {
    eventId: state.completionEventId,
    sessionId: state.sessionId,
    sceneId: state.scene.sceneId,
    sceneVersionId: state.scene.id,
    completedAt: state.updatedAt,
  };
}

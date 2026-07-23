import { createTrainingDraft, trainingReducer } from '../../domain/training/trainingReducer';
import type {
  EvidenceSelection,
  TrainingAction,
  TrainingDraft,
} from '../../domain/training/types';
import { validPublishedScene } from './scene';

export const trainingNow = new Date('2026-07-22T12:00:00.000Z');
export const actionTimes = {
  facts: '2026-07-22T12:01:00.000Z',
  thought: '2026-07-22T12:02:00.000Z',
  prediction: '2026-07-22T12:03:00.000Z',
  hypotheses: '2026-07-22T12:04:00.000Z',
  evidence: '2026-07-22T12:05:00.000Z',
  completion: '2026-07-22T12:06:00.000Z',
} as const;

export const validEvidence: EvidenceSelection = {
  recurrence: 'repeated',
  knownFacts: 'partial',
  assumptions: 'present',
  danger: 'none-known',
  directlySolvable: 'partly',
  nextNeed: 'boundary',
};

export function baseTrainingDraft(): TrainingDraft {
  return {
    ...createTrainingDraft(
      '00000000-0000-4000-8000-000000000101',
      validPublishedScene,
      '40000000-0000-4000-8000-000000000001',
      trainingNow,
    ),
    completionEventId: '50000000-0000-4000-8000-000000000001',
  };
}

export function reduceTraining(
  state: TrainingDraft,
  actions: TrainingAction[],
): TrainingDraft {
  return actions.reduce(trainingReducer, state);
}

export function completedTrainingDraft(): TrainingDraft {
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
    {
      type: 'accept-expression-action',
      at: actionTimes.completion,
    },
  ]);
}

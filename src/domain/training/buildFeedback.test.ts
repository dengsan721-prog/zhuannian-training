import { describe, expect, it } from 'vitest';
import { validPublishedScene } from '../../test/fixtures/scene';
import {
  baseTrainingDraft,
  completedTrainingDraft,
} from '../../test/fixtures/training';
import { buildFeedback } from './buildFeedback';

describe('buildFeedback', () => {
  it('copies only same-version authored content in authored hypothesis order', () => {
    const scene = structuredClone(validPublishedScene);
    const state = completedTrainingDraft();

    const feedback = buildFeedback(scene, state);

    expect(feedback).toEqual({
      thoughtPath: scene.thoughtOptions[0],
      hypotheses: [
        scene.hypotheses[0],
        scene.hypotheses[2],
      ],
      boundary: scene.boundary,
      newExpression: scene.newExpression,
      microAction: scene.microAction,
      fallbackPlan: scene.fallbackPlan,
    });
    expect(feedback.thoughtPath).not.toBe(scene.thoughtOptions[0]);
    expect(feedback.hypotheses[0]).not.toBe(scene.hypotheses[0]);
  });

  it('returns no thought path for an authored fixed non-option selection', () => {
    const state = {
      ...completedTrainingDraft(),
      firstThought: { kind: 'uncertain' as const },
    };

    expect(buildFeedback(validPublishedScene, state).thoughtPath).toBeNull();
  });

  it('rejects incomplete, unaccepted, mismatched, and stop-card feedback', () => {
    expect(() => buildFeedback(validPublishedScene, baseTrainingDraft())).toThrow(
      'ordinary_feedback_unavailable',
    );
    expect(() => buildFeedback(validPublishedScene, {
      ...completedTrainingDraft(),
      expressionAccepted: false,
    })).toThrow('ordinary_feedback_unavailable');
    expect(() => buildFeedback({
      ...validPublishedScene,
      id: '10000000-0000-4000-8000-000000000099',
    }, completedTrainingDraft())).toThrow('scene_version_mismatch');
    expect(() => buildFeedback({
      ...validPublishedScene,
      riskLevel: 'stop',
    }, completedTrainingDraft())).toThrow('ordinary_feedback_unavailable');
  });

  it('revalidates selected authored IDs before returning feedback', () => {
    expect(() => buildFeedback(validPublishedScene, {
      ...completedTrainingDraft(),
      firstThought: { kind: 'option', optionId: 'forged' },
    })).toThrow('invalid_first_thought');
    expect(() => buildFeedback(validPublishedScene, {
      ...completedTrainingDraft(),
      selectedHypothesisIds: ['need-autonomy', 'forged'],
    })).toThrow('invalid_hypothesis');
  });

  it.each([
    ['boundary', null],
    ['newExpression', null],
    ['microAction', null],
    ['fallbackPlan', null],
  ] as const)('rejects ordinary content without authored %s', (field, value) => {
    expect(() => buildFeedback({
      ...validPublishedScene,
      [field]: value,
    }, completedTrainingDraft())).toThrow('ordinary_feedback_unavailable');
  });
});

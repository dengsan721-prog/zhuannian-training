import type {
  PublishedSceneVersion,
  ThoughtOption,
} from '../scenes/types';
import type {
  FirstThoughtSelection,
  TrainingDraft,
  TrainingFeedback,
} from './types';

function readThoughtPath(
  scene: PublishedSceneVersion,
  value: FirstThoughtSelection | undefined,
): ThoughtOption | null {
  if (!value || typeof value !== 'object' || typeof value.kind !== 'string') {
    throw new Error('invalid_first_thought');
  }
  if (value.kind !== 'option') {
    if (!['uncertain', 'multiple', 'none'].includes(value.kind)) {
      throw new Error('invalid_first_thought');
    }
    return null;
  }
  const authored = scene.thoughtOptions.find((item) => item.id === value.optionId);
  if (!authored) throw new Error('invalid_first_thought');
  return { ...authored };
}

function hasAuthoredOrdinaryFeedback(scene: PublishedSceneVersion): boolean {
  return scene.riskLevel !== 'stop'
    && typeof scene.boundary === 'string'
    && scene.boundary.trim() !== ''
    && typeof scene.newExpression === 'string'
    && scene.newExpression.trim() !== ''
    && typeof scene.microAction === 'string'
    && scene.microAction.trim() !== ''
    && typeof scene.fallbackPlan === 'string'
    && scene.fallbackPlan.trim() !== '';
}

export function buildFeedback(
  scene: PublishedSceneVersion,
  state: TrainingDraft,
): TrainingFeedback {
  if (state.scene.id !== scene.id) {
    throw new Error('scene_version_mismatch');
  }
  if (state.status !== 'completed'
    || !state.expressionAccepted
    || state.scene.riskLevel === 'stop'
    || !hasAuthoredOrdinaryFeedback(scene)) {
    throw new Error('ordinary_feedback_unavailable');
  }

  const thoughtPath = readThoughtPath(scene, state.firstThought);
  const selectedIds = state.selectedHypothesisIds;
  if (selectedIds.length < 2 || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('invalid_hypothesis');
  }
  const authoredIds = new Set(scene.hypotheses.map((item) => item.id));
  if (!selectedIds.every((id) => authoredIds.has(id))) {
    throw new Error('invalid_hypothesis');
  }
  const selected = new Set(selectedIds);

  return {
    thoughtPath,
    hypotheses: scene.hypotheses
      .filter((item) => selected.has(item.id))
      .map((item) => ({ ...item })),
    boundary: scene.boundary!,
    newExpression: scene.newExpression!,
    microAction: scene.microAction!,
    fallbackPlan: scene.fallbackPlan!,
  };
}

import type { TrainingDraft } from '../../domain/training/types';
import {
  baseTrainingDraft,
  completedTrainingDraft,
} from './training';

export const supportSceneVersionId =
  '10000000-0000-4000-8000-000000000001';
export const supportSceneId =
  '20000000-0000-4000-8000-000000000001';

function withSupportSceneIds(draft: TrainingDraft): TrainingDraft {
  return {
    ...draft,
    scene: {
      ...draft.scene,
      id: supportSceneVersionId,
      sceneId: supportSceneId,
    },
  };
}

export function supportBaseTrainingDraft(): TrainingDraft {
  return withSupportSceneIds(baseTrainingDraft());
}

export function completedSupportTrainingDraft(): TrainingDraft {
  return withSupportSceneIds(completedTrainingDraft());
}

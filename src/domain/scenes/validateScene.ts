import type { SceneVersion } from './types';
import { sceneSchema } from './schema';

export function validateScene(input: unknown): SceneVersion {
  return sceneSchema.parse(input);
}

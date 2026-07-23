import type { PublishedSceneVersion } from '../../domain/scenes/types';

export interface SceneRepository {
  listPublished(filter?: {
    relationship?: string;
    category?: string;
  }): Promise<PublishedSceneVersion[]>;
  getBySlug(slug: string): Promise<PublishedSceneVersion | null>;
}

import type { PublishedSceneVersion } from '../../domain/scenes/types';
import type { SceneRepository } from '../../lib/repositories/SceneRepository';

export class InMemorySceneRepository implements SceneRepository {
  constructor(private readonly scenes: PublishedSceneVersion[] = []) {}

  async listPublished(
    filter: { relationship?: string; category?: string } = {},
  ): Promise<PublishedSceneVersion[]> {
    return this.scenes.filter((scene) => (
      (!filter.relationship || scene.relationship === filter.relationship)
      && (!filter.category || scene.category === filter.category)
    ));
  }

  async getBySlug(slug: string): Promise<PublishedSceneVersion | null> {
    return this.scenes.find((scene) => scene.slug === slug) ?? null;
  }

  async getPublishedById(
    sceneVersionId: string,
  ): Promise<PublishedSceneVersion | null> {
    return this.scenes.find((scene) => scene.id === sceneVersionId) ?? null;
  }
}

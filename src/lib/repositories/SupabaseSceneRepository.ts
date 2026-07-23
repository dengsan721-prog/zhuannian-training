import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import { validateScene } from '../../domain/scenes/validateScene';
import type { SceneRepository } from './SceneRepository';

const sceneSelection = 'id,status,payload,scenes!inner(id,slug,relationship,category)';

type SceneRelation = {
  id: string;
  slug: string;
  relationship: string;
  category: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSceneRelation(value: unknown): SceneRelation {
  if (!isRecord(value)
    || typeof value.id !== 'string' || value.id.trim() === ''
    || typeof value.slug !== 'string' || value.slug.trim() === ''
    || typeof value.relationship !== 'string' || value.relationship.trim() === ''
    || typeof value.category !== 'string' || value.category.trim() === '') {
    throw new Error('invalid scene relation');
  }

  return {
    id: value.id,
    slug: value.slug,
    relationship: value.relationship,
    category: value.category,
  };
}

export class SupabaseSceneRepository implements SceneRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listPublished(
    filter: { relationship?: string; category?: string } = {},
  ): Promise<PublishedSceneVersion[]> {
    let query = this.client
      .from('scene_versions')
      .select(sceneSelection)
      .eq('status', 'published');

    if (filter.relationship) {
      query = query.eq('scenes.relationship', filter.relationship);
    }
    if (filter.category) {
      query = query.eq('scenes.category', filter.category);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('invalid published scene list');

    return data.map((row) => this.toPublished(row));
  }

  async getBySlug(slug: string): Promise<PublishedSceneVersion | null> {
    const { data, error } = await this.client
      .from('scene_versions')
      .select(sceneSelection)
      .eq('status', 'published')
      .eq('scenes.slug', slug)
      .maybeSingle();

    if (error) throw error;
    return data === null ? null : this.toPublished(data);
  }

  private toPublished(value: unknown): PublishedSceneVersion {
    if (!isRecord(value)
      || typeof value.id !== 'string'
      || value.status !== 'published'
      || !Object.hasOwn(value, 'payload')) {
      throw new Error('invalid published scene row');
    }

    const relation = readSceneRelation(value.scenes);
    const scene = validateScene(value.payload);
    if (relation.slug !== scene.slug
      || relation.relationship !== scene.relationship
      || relation.category !== scene.category) {
      throw new Error('scene relation does not match payload');
    }

    return {
      ...scene,
      id: value.id,
      sceneId: relation.id,
      status: 'published',
    };
  }
}

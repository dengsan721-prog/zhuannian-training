import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublishedSceneVersion, RiskLevel } from '../../domain/scenes/types';
import { validateScene } from '../../domain/scenes/validateScene';
import type { SceneRepository } from './SceneRepository';

const sceneSelection = 'id,version,status,risk,payload,scenes!inner(id,scene_code,slug,relationship,category)';

type SceneRelation = {
  id: string;
  sceneCode: string;
  slug: string;
  relationship: string;
  category: string;
};

const riskLevels = new Set<RiskLevel>(['standard', 'caution', 'stop']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && riskLevels.has(value as RiskLevel);
}

function readSceneRelation(value: unknown): SceneRelation {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.scene_code)
    || !isNonEmptyString(value.slug)
    || !isNonEmptyString(value.relationship)
    || !isNonEmptyString(value.category)) {
    throw new Error('invalid scene relation');
  }

  return {
    id: value.id,
    sceneCode: value.scene_code,
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
      || !isNonEmptyString(value.id)
      || typeof value.version !== 'number'
      || !Number.isInteger(value.version)
      || value.version < 1
      || value.status !== 'published'
      || !isRiskLevel(value.risk)
      || !Object.hasOwn(value, 'payload')) {
      throw new Error('invalid published scene row');
    }

    const relation = readSceneRelation(value.scenes);
    const scene = validateScene(value.payload);
    if (relation.sceneCode !== scene.sceneCode
      || relation.slug !== scene.slug
      || relation.relationship !== scene.relationship
      || relation.category !== scene.category
      || value.version !== scene.version
      || value.risk !== scene.riskLevel) {
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

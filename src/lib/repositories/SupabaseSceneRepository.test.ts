import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { validPublishedScene, validScene } from '../../test/fixtures/scene';
import { InMemorySceneRepository } from '../../test/repositories/InMemorySceneRepository';
import { SupabaseSceneRepository } from './SupabaseSceneRepository';

type QueryResult = { data: unknown; error: unknown };

function fakeClient(result: QueryResult) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(result);
  query.then.mockImplementation((onFulfilled, onRejected) => (
    Promise.resolve(result).then(onFulfilled, onRejected)
  ));
  const select = vi.fn(() => query);
  const from = vi.fn(() => ({ select }));

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    query,
  };
}

const joinedRow = {
  id: '30000000-0000-0000-0000-000000000001',
  version: validScene.version,
  status: 'published',
  risk: validScene.riskLevel,
  payload: validScene,
  scenes: {
    id: '20000000-0000-0000-0000-000000000001',
    scene_code: validScene.sceneCode,
    slug: validScene.slug,
    relationship: validScene.relationship,
    category: validScene.category,
  },
};

describe('SupabaseSceneRepository', () => {
  it('queries only published rows and maps database identities', async () => {
    const fake = fakeClient({ data: [joinedRow], error: null });
    const repository = new SupabaseSceneRepository(fake.client);

    const scenes = await repository.listPublished();

    expect(fake.from).toHaveBeenCalledWith('scene_versions');
    expect(fake.select).toHaveBeenCalledWith(
      'id,version,status,risk,payload,scenes!inner(id,scene_code,slug,relationship,category)',
    );
    expect(fake.query.eq).toHaveBeenCalledWith('status', 'published');
    expect(scenes).toEqual([{
      ...validScene,
      id: joinedRow.id,
      sceneId: joinedRow.scenes.id,
      status: 'published',
    }]);
  });

  it('targets joined scene metadata for optional exact-match filters', async () => {
    const fake = fakeClient({ data: [], error: null });
    const repository = new SupabaseSceneRepository(fake.client);

    await repository.listPublished({
      relationship: 'parent-child',
      category: '手机与家庭规则',
    });

    expect(fake.query.eq.mock.calls).toEqual([
      ['status', 'published'],
      ['scenes.relationship', 'parent-child'],
      ['scenes.category', '手机与家庭规则'],
    ]);
  });

  it('rejects a malformed list response instead of treating it as content', async () => {
    const fake = fakeClient({ data: null, error: null });

    await expect(
      new SupabaseSceneRepository(fake.client).listPublished(),
    ).rejects.toThrow('invalid published scene list');
  });

  it('validates every payload and rejects malformed joined metadata', async () => {
    const invalidPayload = { ...validScene, title: '' };
    const invalidPayloadClient = fakeClient({
      data: [joinedRow, { ...joinedRow, id: 'bad-version', payload: invalidPayload }],
      error: null,
    });
    const invalidRelationClient = fakeClient({
      data: [{ ...joinedRow, scenes: null }],
      error: null,
    });

    await expect(
      new SupabaseSceneRepository(invalidPayloadClient.client).listPublished(),
    ).rejects.toThrow();
    await expect(
      new SupabaseSceneRepository(invalidRelationClient.client).listPublished(),
    ).rejects.toThrow(/scene relation/i);
  });

  it('rejects joined metadata that disagrees with the governed payload', async () => {
    const mismatchedClient = fakeClient({
      data: [{
        ...joinedRow,
        scenes: { ...joinedRow.scenes, slug: 'different-scene' },
      }],
      error: null,
    });

    await expect(
      new SupabaseSceneRepository(mismatchedClient.client).listPublished(),
    ).rejects.toThrow(/scene relation/i);
  });

  it.each([
    [
      'sceneCode',
      {
        ...joinedRow,
        scenes: { ...joinedRow.scenes, scene_code: 'PC-999' },
      },
    ],
    ['version', { ...joinedRow, version: validScene.version + 1 }],
    ['riskLevel', { ...joinedRow, risk: 'caution' }],
  ])('rejects a %s mismatch between governed metadata and payload', async (_field, row) => {
    const fake = fakeClient({ data: [row], error: null });

    await expect(
      new SupabaseSceneRepository(fake.client).listPublished(),
    ).rejects.toThrow(/does not match payload/i);
  });

  it.each([
    ['empty row id', { ...joinedRow, id: '' }],
    ['non-integer row version', { ...joinedRow, version: 1.5 }],
    ['unknown row risk', { ...joinedRow, risk: 'unknown' }],
  ])('rejects an invalid published row: %s', async (_case, row) => {
    const fake = fakeClient({ data: [row], error: null });

    await expect(
      new SupabaseSceneRepository(fake.client).listPublished(),
    ).rejects.toThrow(/invalid published scene row/i);
  });

  it('returns null when a published slug has no row', async () => {
    const fake = fakeClient({ data: null, error: null });
    const repository = new SupabaseSceneRepository(fake.client);

    await expect(repository.getBySlug('not-found')).resolves.toBeNull();
    expect(fake.query.eq.mock.calls).toEqual([
      ['status', 'published'],
      ['scenes.slug', 'not-found'],
    ]);
    expect(fake.query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('loads only the exact published version id for recovery', async () => {
    const fake = fakeClient({ data: joinedRow, error: null });
    const repository = new SupabaseSceneRepository(fake.client);

    await expect(repository.getPublishedById(joinedRow.id)).resolves.toEqual({
      ...validScene,
      id: joinedRow.id,
      sceneId: joinedRow.scenes.id,
      status: 'published',
    });
    expect(fake.query.eq.mock.calls).toEqual([
      ['status', 'published'],
      ['id', joinedRow.id],
    ]);
    expect(fake.query.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('propagates query and validation failures without fallback content', async () => {
    const queryError = new Error('query failed');
    const failingClient = fakeClient({ data: null, error: queryError });
    const invalidClient = fakeClient({
      data: { ...joinedRow, payload: { ...validScene, slug: 'NO SPACES ALLOWED' } },
      error: null,
    });

    await expect(
      new SupabaseSceneRepository(failingClient.client).getBySlug(validScene.slug),
    ).rejects.toBe(queryError);
    await expect(
      new SupabaseSceneRepository(invalidClient.client).getBySlug(validScene.slug),
    ).rejects.toThrow();
  });
});

describe('InMemorySceneRepository', () => {
  const familyScene = {
    ...validPublishedScene,
    id: '10000000-0000-0000-0000-000000000002',
    sceneId: '20000000-0000-0000-0000-000000000002',
    sceneCode: 'FR-002' as const,
    slug: 'quiet-partner',
    relationship: 'family' as const,
    category: '夫妻沟通',
  };

  it('uses the same exact-match filters and slug lookup', async () => {
    const repository = new InMemorySceneRepository([validPublishedScene, familyScene]);

    await expect(repository.listPublished({ relationship: 'family' })).resolves.toEqual([
      familyScene,
    ]);
    await expect(repository.listPublished({ category: '夫妻沟通' })).resolves.toEqual([
      familyScene,
    ]);
    await expect(repository.listPublished({ category: '夫妻' })).resolves.toEqual([]);
    await expect(repository.getBySlug(familyScene.slug)).resolves.toEqual(familyScene);
    await expect(repository.getBySlug('missing')).resolves.toBeNull();
    await expect(repository.getPublishedById(validPublishedScene.id))
      .resolves.toEqual(validPublishedScene);
    await expect(repository.getPublishedById('10000000-0000-0000-0000-999999999999'))
      .resolves.toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseTrainingDraft } from '../../test/fixtures/training';
import {
  getOrCreatePendingStart,
  loadRecoveryEnvelope,
  loadSafetyContext,
  removePendingStart,
  removeSafetyContext,
  saveSafetyContext,
  trainingDraftStore,
} from './trainingDraftStore';

const draftKey = (userId: string, sessionId: string) =>
  `turning-mind:draft:${userId}:${sessionId}`;

describe('trainingDraftStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    trainingDraftStore.removeAllFromMemory();
    vi.restoreAllMocks();
  });

  it('keeps the full draft only in module memory and persists an exact recovery envelope', () => {
    const draft = baseTrainingDraft();

    trainingDraftStore.save(draft);

    expect(trainingDraftStore.load(
      draft.userId,
      draft.sessionId,
      new Date(draft.updatedAt),
    )).toEqual(draft);
    const raw = sessionStorage.getItem(draftKey(draft.userId, draft.sessionId));
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope).toEqual({
      schemaVersion: 1,
      userId: draft.userId,
      sessionId: draft.sessionId,
      sceneVersionId: draft.scene.id,
      completionEventId: draft.completionEventId,
      expiresAt: draft.expiresAt,
    });
    expect(Object.keys(envelope).sort()).toEqual([
      'completionEventId',
      'expiresAt',
      'sceneVersionId',
      'schemaVersion',
      'sessionId',
      'userId',
    ]);
    expect(raw).not.toMatch(
      /firstThought|predictedResponse|selectedHypothesisIds|evidence|expressionAccepted|他根本没把我的话当回事/,
    );
  });

  it('exposes only the strict envelope after a module reset', async () => {
    const draft = baseTrainingDraft();
    trainingDraftStore.save(draft);

    vi.resetModules();
    const fresh = await import('./trainingDraftStore');

    expect(fresh.trainingDraftStore.load(draft.userId, draft.sessionId)).toBeNull();
    expect(
      fresh.loadRecoveryEnvelope(draft.userId, draft.sessionId, new Date(draft.updatedAt)),
    ).toEqual({
      schemaVersion: 1,
      userId: draft.userId,
      sessionId: draft.sessionId,
      sceneVersionId: draft.scene.id,
      completionEventId: draft.completionEventId,
      expiresAt: draft.expiresAt,
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['old schema', JSON.stringify({
      schemaVersion: 0,
      userId: baseTrainingDraft().userId,
      sessionId: baseTrainingDraft().sessionId,
      sceneVersionId: baseTrainingDraft().scene.id,
      completionEventId: baseTrainingDraft().completionEventId,
      expiresAt: baseTrainingDraft().expiresAt,
    })],
    ['extra key', JSON.stringify({
      schemaVersion: 1,
      userId: baseTrainingDraft().userId,
      sessionId: baseTrainingDraft().sessionId,
      sceneVersionId: baseTrainingDraft().scene.id,
      completionEventId: baseTrainingDraft().completionEventId,
      expiresAt: baseTrainingDraft().expiresAt,
      firstThought: 'private',
    })],
    ['cross user', JSON.stringify({
      schemaVersion: 1,
      userId: '00000000-0000-4000-8000-000000000999',
      sessionId: baseTrainingDraft().sessionId,
      sceneVersionId: baseTrainingDraft().scene.id,
      completionEventId: baseTrainingDraft().completionEventId,
      expiresAt: baseTrainingDraft().expiresAt,
    })],
    ['invalid UUID', JSON.stringify({
      schemaVersion: 1,
      userId: baseTrainingDraft().userId,
      sessionId: 'not-a-uuid',
      sceneVersionId: baseTrainingDraft().scene.id,
      completionEventId: baseTrainingDraft().completionEventId,
      expiresAt: baseTrainingDraft().expiresAt,
    })],
    ['expired', JSON.stringify({
      schemaVersion: 1,
      userId: baseTrainingDraft().userId,
      sessionId: baseTrainingDraft().sessionId,
      sceneVersionId: baseTrainingDraft().scene.id,
      completionEventId: baseTrainingDraft().completionEventId,
      expiresAt: '2026-07-22T11:59:00.000Z',
    })],
  ])('fails closed and removes a %s recovery envelope', (_case, raw) => {
    const draft = baseTrainingDraft();
    const key = draftKey(draft.userId, draft.sessionId);
    sessionStorage.setItem(key, raw);

    expect(
      loadRecoveryEnvelope(draft.userId, draft.sessionId, new Date(draft.updatedAt)),
    ).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('does not crash when session storage throws', () => {
    const draft = baseTrainingDraft();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });

    expect(() => trainingDraftStore.save(draft)).not.toThrow();
    expect(trainingDraftStore.load(
      draft.userId,
      draft.sessionId,
      new Date(draft.updatedAt),
    )).toEqual(draft);

    trainingDraftStore.removeAllFromMemory();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(() => loadRecoveryEnvelope(
      draft.userId,
      draft.sessionId,
      new Date(draft.updatedAt),
    )).not.toThrow();
    expect(loadRecoveryEnvelope(
      draft.userId,
      draft.sessionId,
      new Date(draft.updatedAt),
    )).toBeNull();
  });

  it('persists only a minimal discriminated safety context', () => {
    const draft = baseTrainingDraft();
    saveSafetyContext(draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });

    expect(loadSafetyContext(draft.sessionId)).toEqual({
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });
    expect(sessionStorage.getItem(`turning-mind:safety:${draft.sessionId}`))
      .not.toMatch(/firstThought|evidence|selectedHypothesisIds/);

    removeSafetyContext(draft.sessionId);
    expect(loadSafetyContext(draft.sessionId)).toBeNull();
  });

  it('reuses the same pending start request until explicitly removed', () => {
    const draft = baseTrainingDraft();
    const first = getOrCreatePendingStart(
      draft.userId,
      draft.scene.id,
      draft.scene.slug,
    );
    const second = getOrCreatePendingStart(
      draft.userId,
      draft.scene.id,
      draft.scene.slug,
    );

    expect(second).toEqual(first);
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Object.keys(first).sort()).toEqual([
      'requestId',
      'sceneVersionId',
      'slug',
      'userId',
    ]);

    removePendingStart(draft.userId, draft.scene.slug);
    const third = getOrCreatePendingStart(
      draft.userId,
      draft.scene.id,
      draft.scene.slug,
    );
    expect(third.requestId).not.toBe(first.requestId);
  });

  it('clears in-memory pending starts when all user state is removed', () => {
    const draft = baseTrainingDraft();
    const first = getOrCreatePendingStart(
      draft.userId,
      draft.scene.id,
      draft.scene.slug,
    );

    trainingDraftStore.removeAllForUser(draft.userId);
    const second = getOrCreatePendingStart(
      draft.userId,
      draft.scene.id,
      draft.scene.slug,
    );

    expect(second.requestId).not.toBe(first.requestId);
  });
});

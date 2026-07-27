import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseTrainingDraft } from '../../test/fixtures/training';
import {
  getOrCreatePendingStart,
  loadRecoveryEnvelope,
  loadSafetyContext,
  loadSafetyStopRetryMarker,
  removePendingStart,
  removeAllSafetyContextsForUser,
  removeAllSafetyStateForUser,
  removeSafetyContext,
  removeSafetyStateForOtherUsers,
  removeSafetyStopRetryMarker,
  saveSafetyContext,
  saveSafetyStopRetryMarker,
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
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });

    expect(loadSafetyContext(draft.userId, draft.sessionId)).toEqual({
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });
    const raw = sessionStorage.getItem(
      `turning-mind:safety:${draft.userId}:${draft.sessionId}`,
    );
    expect(JSON.parse(raw!)).toEqual({
      ownerUserId: draft.userId,
      sessionId: draft.sessionId,
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });
    expect(raw).not.toMatch(/firstThought|evidence|selectedHypothesisIds|confirmation|requestId|priority/);

    removeSafetyContext(draft.userId, draft.sessionId);
    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
  });

  it('strictly clones safety contexts and rejects cross-owner or legacy envelopes', () => {
    const draft = baseTrainingDraft();
    const context = {
      sceneVersionId: draft.scene.id,
      source: 'user' as const,
      signalCode: 'user_declared_danger' as const,
    };
    saveSafetyContext(draft.userId, draft.sessionId, context);
    context.sceneVersionId = '99999999-9999-4999-8999-999999999999';

    const first = loadSafetyContext(draft.userId, draft.sessionId);
    expect(first).toEqual({
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });
    if (first?.source === 'user') {
      first.signalCode = 'medical_emergency';
    }
    expect(loadSafetyContext(draft.userId, draft.sessionId)).toEqual({
      sceneVersionId: draft.scene.id,
      source: 'user',
      signalCode: 'user_declared_danger',
    });

    const foreignOwner = '99999999-9999-4999-8999-999999999999';
    expect(loadSafetyContext(foreignOwner, draft.sessionId)).toBeNull();

    const legacyKey = `turning-mind:safety:${draft.sessionId}`;
    sessionStorage.setItem(legacyKey, JSON.stringify({
      sceneVersionId: draft.scene.id,
      source: 'server',
    }));
    expect(loadSafetyContext(draft.userId, draft.sessionId)).not.toBeNull();
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
  });

  it('clears all owned safety contexts across module memory and session storage', () => {
    const draft = baseTrainingDraft();
    const otherSession = '88888888-8888-4888-8888-888888888888';
    const otherOwner = '99999999-9999-4999-8999-999999999999';
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyContext(draft.userId, otherSession, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyContext(otherOwner, otherSession, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });

    removeAllSafetyContextsForUser(draft.userId);

    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyContext(draft.userId, otherSession)).toBeNull();
    expect(loadSafetyContext(otherOwner, otherSession)).not.toBeNull();
  });

  it('persists a strict owner-bound safety-stop retry marker without training data', () => {
    const draft = baseTrainingDraft();
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);

    const key = `turning-mind:safety-stop-retry:${draft.userId}:${draft.sessionId}`;
    const raw = sessionStorage.getItem(key);
    expect(JSON.parse(raw!)).toEqual({
      ownerUserId: draft.userId,
      sessionId: draft.sessionId,
    });
    expect(Object.keys(JSON.parse(raw!)).sort()).toEqual([
      'ownerUserId',
      'sessionId',
    ]);
    expect(raw).not.toMatch(
      /scene|firstThought|evidence|selectedHypothesisIds|signal|report|confirmation|requestId|priority|prose|他根本没把我的话当回事/,
    );

    const first = loadSafetyStopRetryMarker(draft.userId, draft.sessionId);
    expect(first).toEqual({
      ownerUserId: draft.userId,
      sessionId: draft.sessionId,
    });
    first!.ownerUserId = '99999999-9999-4999-8999-999999999999';
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toEqual({
      ownerUserId: draft.userId,
      sessionId: draft.sessionId,
    });

    trainingDraftStore.removeAllFromMemory();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toEqual({
      ownerUserId: draft.userId,
      sessionId: draft.sessionId,
    });
    removeSafetyStopRetryMarker(draft.userId, draft.sessionId);
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
  });

  it('rejects malformed, cross-owner, and legacy safety-stop retry markers', () => {
    const draft = baseTrainingDraft();
    const key = `turning-mind:safety-stop-retry:${draft.userId}:${draft.sessionId}`;
    const legacyKey = `turning-mind:safety-stop-retry:${draft.sessionId}`;
    sessionStorage.setItem(key, JSON.stringify({
      ownerUserId: draft.userId,
      sessionId: draft.sessionId,
      sceneVersionId: draft.scene.id,
    }));
    sessionStorage.setItem(legacyKey, JSON.stringify({
      sessionId: draft.sessionId,
    }));

    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(legacyKey)).toBeNull();

    sessionStorage.setItem(key, JSON.stringify({
      ownerUserId: '99999999-9999-4999-8999-999999999999',
      sessionId: draft.sessionId,
    }));
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('provides logout and owner-switch cleanup for contexts and retry markers', () => {
    const draft = baseTrainingDraft();
    const otherSession = '88888888-8888-4888-8888-888888888888';
    const otherOwner = '99999999-9999-4999-8999-999999999999';
    for (const [owner, ownedSession] of [
      [draft.userId, draft.sessionId],
      [otherOwner, otherSession],
    ] as const) {
      saveSafetyContext(owner, ownedSession, {
        sceneVersionId: draft.scene.id,
        source: 'server',
      });
      saveSafetyStopRetryMarker(owner, ownedSession);
    }

    removeSafetyStateForOtherUsers(draft.userId);

    expect(loadSafetyContext(draft.userId, draft.sessionId)).not.toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).not.toBeNull();
    expect(loadSafetyContext(otherOwner, otherSession)).toBeNull();
    expect(loadSafetyStopRetryMarker(otherOwner, otherSession)).toBeNull();

    removeAllSafetyStateForUser(draft.userId);

    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
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

  it('clears owned safety contexts when all user state is removed', () => {
    const draft = baseTrainingDraft();
    saveSafetyContext(draft.userId, draft.sessionId, {
      sceneVersionId: draft.scene.id,
      source: 'server',
    });
    saveSafetyStopRetryMarker(draft.userId, draft.sessionId);

    trainingDraftStore.removeAllForUser(draft.userId);

    expect(loadSafetyContext(draft.userId, draft.sessionId)).toBeNull();
    expect(loadSafetyStopRetryMarker(draft.userId, draft.sessionId)).toBeNull();
    expect(sessionStorage.getItem(
      `turning-mind:safety:${draft.userId}:${draft.sessionId}`,
    )).toBeNull();
  });
});

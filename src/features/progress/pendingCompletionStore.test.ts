import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletionCommand } from '../../domain/training/types';
import { pendingCompletionStore } from './pendingCompletionStore';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const command: CompletionCommand = {
  eventId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  sceneId: '33333333-3333-4333-8333-333333333333',
  sceneVersionId: '44444444-4444-4444-8444-444444444444',
  completedAt: '2026-07-22T12:10:00.000Z',
};

const storageKey = (owner = userId, sessionId = command.sessionId) =>
  `turning-mind:pending-completion:v1:${owner}:${sessionId}`;

describe('pendingCompletionStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores exactly the current-user binding and five-key command', () => {
    expect(pendingCompletionStore.save(userId, command)).toBe(true);

    const raw = sessionStorage.getItem(storageKey());
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({
      userId,
      eventId: command.eventId,
      sessionId: command.sessionId,
      sceneId: command.sceneId,
      sceneVersionId: command.sceneVersionId,
      completedAt: command.completedAt,
    });
    expect(raw).not.toContain('firstThought');
    expect(raw).not.toContain('hypotheses');
    expect(raw).not.toContain('expression');
    expect(raw).not.toContain('payload');
    expect(raw).not.toContain('content');
  });

  it('loads only an exact valid record bound to the current user and session', () => {
    pendingCompletionStore.save(userId, command);

    expect(pendingCompletionStore.load(userId, command.sessionId)).toEqual(command);
    expect(pendingCompletionStore.load(otherUserId, command.sessionId)).toBeNull();
    expect(pendingCompletionStore.load(userId, otherUserId)).toBeNull();
  });

  it.each([
    ['invalid JSON', '{'],
    ['an extra field', JSON.stringify({
      userId,
      ...command,
      answer: 'private answer',
    })],
    ['a cross-user value', JSON.stringify({
      userId: otherUserId,
      ...command,
    })],
    ['a non-canonical browser time', JSON.stringify({
      userId,
      ...command,
      completedAt: '2026-07-22T20:10:00+08:00',
    })],
    ['an invalid UUID', JSON.stringify({
      userId,
      ...command,
      eventId: 'event-1',
    })],
  ])('fails closed and removes %s', (_label, raw) => {
    sessionStorage.setItem(storageKey(), raw);

    expect(pendingCompletionStore.load(userId, command.sessionId)).toBeNull();
    expect(sessionStorage.getItem(storageKey())).toBeNull();
  });

  it('rejects invalid input without writing storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    expect(pendingCompletionStore.save(userId, {
      ...command,
      completedAt: '2026-07-22',
    })).toBe(false);
    expect(pendingCompletionStore.save(userId, {
      ...command,
      unexpected: 'private',
    } as CompletionCommand)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('fails closed without crashing when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(pendingCompletionStore.save(userId, command)).toBe(false);

    vi.restoreAllMocks();
    sessionStorage.setItem(storageKey(), JSON.stringify({ userId, ...command }));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(pendingCompletionStore.load(userId, command.sessionId)).toBeNull();
    expect(() => pendingCompletionStore.remove(userId, command.sessionId))
      .not.toThrow();
  });

  it('removes only the exact user-scoped pending command', () => {
    pendingCompletionStore.save(userId, command);
    sessionStorage.setItem(
      storageKey(otherUserId),
      JSON.stringify({ userId: otherUserId, ...command }),
    );

    pendingCompletionStore.remove(userId, command.sessionId);

    expect(sessionStorage.getItem(storageKey())).toBeNull();
    expect(sessionStorage.getItem(storageKey(otherUserId))).not.toBeNull();
  });
});

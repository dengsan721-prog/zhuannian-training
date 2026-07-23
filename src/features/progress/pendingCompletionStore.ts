import type { CompletionCommand } from '../../domain/training/types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const commandKeys = [
  'completedAt',
  'eventId',
  'sceneId',
  'sceneVersionId',
  'sessionId',
] as const;
const storedKeys = [...commandKeys, 'userId'] as const;

const storageKey = (userId: string, sessionId: string) =>
  `turning-mind:pending-completion:v1:${userId}:${sessionId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isCanonicalBrowserTime(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isCompletionCommand(value: unknown): value is CompletionCommand {
  return isRecord(value)
    && hasExactKeys(value, commandKeys)
    && isUuid(value.eventId)
    && isUuid(value.sessionId)
    && isUuid(value.sceneId)
    && isUuid(value.sceneVersionId)
    && isCanonicalBrowserTime(value.completedAt);
}

function removeSafely(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Unavailable storage has no recoverable pending completion.
  }
}

export const pendingCompletionStore = {
  save(userId: string, command: CompletionCommand): boolean {
    if (!isUuid(userId) || !isCompletionCommand(command)) return false;
    const value = {
      userId,
      eventId: command.eventId,
      sessionId: command.sessionId,
      sceneId: command.sceneId,
      sceneVersionId: command.sceneVersionId,
      completedAt: command.completedAt,
    };
    try {
      globalThis.sessionStorage?.setItem(
        storageKey(userId, command.sessionId),
        JSON.stringify(value),
      );
      return globalThis.sessionStorage !== undefined;
    } catch {
      return false;
    }
  },

  load(userId: string, sessionId: string): CompletionCommand | null {
    if (!isUuid(userId) || !isUuid(sessionId)) return null;
    const key = storageKey(userId, sessionId);
    let raw: string | null;
    try {
      raw = globalThis.sessionStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
    if (!raw) return null;

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      removeSafely(key);
      return null;
    }
    if (!isRecord(value)
      || !hasExactKeys(value, storedKeys)
      || value.userId !== userId
      || value.sessionId !== sessionId
      || !isUuid(value.userId)) {
      removeSafely(key);
      return null;
    }

    const command = {
      eventId: value.eventId,
      sessionId: value.sessionId,
      sceneId: value.sceneId,
      sceneVersionId: value.sceneVersionId,
      completedAt: value.completedAt,
    };
    if (!isCompletionCommand(command)) {
      removeSafely(key);
      return null;
    }
    return { ...command };
  },

  remove(userId: string, sessionId: string): void {
    if (!isUuid(userId) || !isUuid(sessionId)) return;
    removeSafely(storageKey(userId, sessionId));
  },
};

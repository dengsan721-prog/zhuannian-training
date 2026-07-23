import type {
  SafetySignalCode,
  TrainingDraft,
} from '../../domain/training/types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const recoveryKeys = [
  'completionEventId',
  'expiresAt',
  'sceneVersionId',
  'schemaVersion',
  'sessionId',
  'userId',
] as const;
const pendingKeys = ['requestId', 'sceneVersionId', 'slug', 'userId'] as const;
const safetySignals = new Set<SafetySignalCode>([
  'physical_or_sexual_violence',
  'serious_threat',
  'coercive_control',
  'child_abuse_or_exploitation',
  'self_harm_or_suicide',
  'bullying_or_retaliation',
  'medical_emergency',
  'user_declared_danger',
]);

export interface TrainingRecoveryEnvelope {
  schemaVersion: 1;
  userId: string;
  sessionId: string;
  sceneVersionId: string;
  completionEventId: string;
  expiresAt: string;
}

export interface PendingStartEnvelope {
  userId: string;
  sceneVersionId: string;
  slug: string;
  requestId: string;
}

export type SafetyContext =
  | {
      sceneVersionId: string;
      source: 'user';
      signalCode: SafetySignalCode;
    }
  | {
      sceneVersionId: string;
      source: 'server';
    };

const drafts = new Map<string, TrainingDraft>();
const memoryPendingStarts = new Map<string, PendingStartEnvelope>();
const memorySafetyContexts = new Map<string, SafetyContext>();

const draftKey = (userId: string, sessionId: string) =>
  `turning-mind:draft:${userId}:${sessionId}`;
const pendingKey = (userId: string, slug: string) =>
  `turning-mind:pending-start:${userId}:${slug}`;
const safetyKey = (sessionId: string) => `turning-mind:safety:${sessionId}`;

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

function isCanonicalTime(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function safeGet(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    globalThis.sessionStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Module memory remains usable when storage is blocked or full.
  }
}

function safeRemove(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Failing closed must not crash the current page.
  }
}

function parseRecoveryEnvelope(
  raw: string,
  expectedUserId: string,
  expectedSessionId: string,
  now: Date,
): TrainingRecoveryEnvelope | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)
    || !hasExactKeys(value, recoveryKeys)
    || value.schemaVersion !== 1
    || !isUuid(value.userId)
    || !isUuid(value.sessionId)
    || !isUuid(value.sceneVersionId)
    || !isUuid(value.completionEventId)
    || !isCanonicalTime(value.expiresAt)
    || value.userId !== expectedUserId
    || value.sessionId !== expectedSessionId
    || Date.parse(value.expiresAt) <= now.getTime()) {
    return null;
  }
  return {
    schemaVersion: 1,
    userId: value.userId,
    sessionId: value.sessionId,
    sceneVersionId: value.sceneVersionId,
    completionEventId: value.completionEventId,
    expiresAt: value.expiresAt,
  };
}

export function loadRecoveryEnvelope(
  userId: string,
  sessionId: string,
  now = new Date(),
): TrainingRecoveryEnvelope | null {
  if (!isUuid(userId) || !isUuid(sessionId)) return null;
  const key = draftKey(userId, sessionId);
  const raw = safeGet(key);
  if (!raw) return null;
  const envelope = parseRecoveryEnvelope(raw, userId, sessionId, now);
  if (!envelope) safeRemove(key);
  return envelope;
}

function toRecoveryEnvelope(draft: TrainingDraft): TrainingRecoveryEnvelope {
  return {
    schemaVersion: 1,
    userId: draft.userId,
    sessionId: draft.sessionId,
    sceneVersionId: draft.scene.id,
    completionEventId: draft.completionEventId,
    expiresAt: draft.expiresAt,
  };
}

export const trainingDraftStore = {
  save(draft: TrainingDraft): void {
    if (draft.status === 'completed' || draft.status === 'safety-stop') {
      this.remove(draft.userId, draft.sessionId);
      return;
    }
    drafts.set(draftKey(draft.userId, draft.sessionId), draft);
    safeSet(draftKey(draft.userId, draft.sessionId), toRecoveryEnvelope(draft));
  },

  load(
    userId: string,
    sessionId: string,
    now = new Date(),
  ): TrainingDraft | null {
    const key = draftKey(userId, sessionId);
    const draft = drafts.get(key);
    if (!draft) return null;
    if (draft.userId !== userId
      || draft.sessionId !== sessionId
      || draft.status === 'completed'
      || draft.status === 'safety-stop'
      || !isCanonicalTime(draft.expiresAt)
      || Date.parse(draft.expiresAt) <= now.getTime()) {
      this.remove(userId, sessionId);
      return null;
    }
    return draft;
  },

  remove(userId: string, sessionId: string): void {
    const key = draftKey(userId, sessionId);
    drafts.delete(key);
    safeRemove(key);
  },

  removeAllForUser(userId: string): void {
    const prefix = `turning-mind:draft:${userId}:`;
    const pendingPrefix = `turning-mind:pending-start:${userId}:`;
    for (const key of drafts.keys()) {
      if (key.startsWith(prefix)) drafts.delete(key);
    }
    for (const key of memoryPendingStarts.keys()) {
      if (key.startsWith(pendingPrefix)) memoryPendingStarts.delete(key);
    }
    try {
      for (let index = globalThis.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = globalThis.sessionStorage.key(index);
        if (key?.startsWith(prefix)
          || key?.startsWith(pendingPrefix)) {
          globalThis.sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Storage denial is treated as no recoverable state.
    }
  },

  removeAllFromMemory(): void {
    drafts.clear();
    memoryPendingStarts.clear();
    memorySafetyContexts.clear();
  },
};

function parsePending(
  raw: string,
  userId: string,
  slug: string,
): PendingStartEnvelope | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)
    || !hasExactKeys(value, pendingKeys)
    || !isUuid(value.userId)
    || !isUuid(value.sceneVersionId)
    || !isUuid(value.requestId)
    || typeof value.slug !== 'string'
    || !slugPattern.test(value.slug)
    || value.userId !== userId
    || value.slug !== slug) {
    return null;
  }
  return {
    userId: value.userId,
    sceneVersionId: value.sceneVersionId,
    slug: value.slug,
    requestId: value.requestId,
  };
}

export function getOrCreatePendingStart(
  userId: string,
  sceneVersionId: string,
  slug: string,
): PendingStartEnvelope {
  if (!isUuid(userId) || !isUuid(sceneVersionId) || !slugPattern.test(slug)) {
    throw new Error('invalid_pending_start');
  }
  const existing = loadPendingStart(userId, slug);
  if (existing) return existing;

  const key = pendingKey(userId, slug);
  const pending = {
    userId,
    sceneVersionId,
    slug,
    requestId: globalThis.crypto.randomUUID(),
  };
  memoryPendingStarts.set(key, pending);
  safeSet(key, pending);
  return pending;
}

export function loadPendingStart(
  userId: string,
  slug: string,
): PendingStartEnvelope | null {
  if (!isUuid(userId) || !slugPattern.test(slug)) return null;
  const key = pendingKey(userId, slug);
  const memory = memoryPendingStarts.get(key);
  if (memory) return memory;
  const raw = safeGet(key);
  if (!raw) return null;
  const stored = parsePending(raw, userId, slug);
  if (!stored) {
    safeRemove(key);
    return null;
  }
  memoryPendingStarts.set(key, stored);
  return stored;
}

export function removePendingStart(
  userId: string,
  slug: string,
): void {
  const key = pendingKey(userId, slug);
  memoryPendingStarts.delete(key);
  safeRemove(key);
}

export function saveSafetyContext(
  sessionId: string,
  context: SafetyContext,
): void {
  if (!isUuid(sessionId)
    || !isUuid(context.sceneVersionId)
    || (context.source === 'user' && !safetySignals.has(context.signalCode))) {
    throw new Error('invalid_safety_context');
  }
  const key = safetyKey(sessionId);
  memorySafetyContexts.set(key, context);
  safeSet(key, context);
}

export function loadSafetyContext(sessionId: string): SafetyContext | null {
  if (!isUuid(sessionId)) return null;
  const key = safetyKey(sessionId);
  const memory = memorySafetyContexts.get(key);
  if (memory) return memory;
  const raw = safeGet(key);
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    safeRemove(key);
    return null;
  }
  if (!isRecord(value) || !isUuid(value.sceneVersionId)) {
    safeRemove(key);
    return null;
  }
  if (value.source === 'server'
    && hasExactKeys(value, ['sceneVersionId', 'source'])) {
    const context: SafetyContext = {
      sceneVersionId: value.sceneVersionId,
      source: 'server',
    };
    memorySafetyContexts.set(key, context);
    return context;
  }
  if (value.source === 'user'
    && hasExactKeys(value, ['sceneVersionId', 'signalCode', 'source'])
    && typeof value.signalCode === 'string'
    && safetySignals.has(value.signalCode as SafetySignalCode)) {
    const context: SafetyContext = {
      sceneVersionId: value.sceneVersionId,
      source: 'user',
      signalCode: value.signalCode as SafetySignalCode,
    };
    memorySafetyContexts.set(key, context);
    return context;
  }
  safeRemove(key);
  return null;
}

export function removeSafetyContext(sessionId: string): void {
  const key = safetyKey(sessionId);
  memorySafetyContexts.delete(key);
  safeRemove(key);
}

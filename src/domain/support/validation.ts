import { codePointLength } from '../../shared/codePointLength';
import type {
  EvidenceSelection,
  FirstThoughtSelection,
  SafetySignalCode,
} from '../training/types';
import type {
  SafetyReportInput,
  SupportSnapshot,
  SupportTicketInput,
} from './types';
import { supportSnapshotCompactUtf8ByteLength } from './snapshotEncoding';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bidiControlPattern = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const utf8Encoder = new TextEncoder();

function containsC0OrC1Control(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined
      && ((codePoint >= 0 && codePoint <= 0x1f)
        || (codePoint >= 0x7f && codePoint <= 0x9f));
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index]);
}

export function isSupportUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

export function comparePostgresCText(
  left: string,
  right: string,
): number {
  const leftBytes = utf8Encoder.encode(left);
  const rightBytes = utf8Encoder.encode(right);
  const sharedLength = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

function isNonEmptyIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSafetySignal(value: unknown): value is SafetySignalCode {
  return value === 'physical_or_sexual_violence'
    || value === 'serious_threat'
    || value === 'coercive_control'
    || value === 'child_abuse_or_exploitation'
    || value === 'self_harm_or_suicide'
    || value === 'bullying_or_retaliation'
    || value === 'medical_emergency'
    || value === 'user_declared_danger';
}

function readFirstThought(value: unknown): FirstThoughtSelection {
  if (!isPlainObject(value)) {
    throw new Error('invalid_support_snapshot');
  }
  if (value.kind === 'option') {
    if (!hasExactKeys(value, ['kind', 'optionId'])
      || !isNonEmptyIdentifier(value.optionId)) {
      throw new Error('invalid_support_snapshot');
    }
    return {
      kind: 'option',
      optionId: value.optionId,
    };
  }
  if (!hasExactKeys(value, ['kind'])) {
    throw new Error('invalid_support_snapshot');
  }
  if (value.kind === 'uncertain') return { kind: 'uncertain' };
  if (value.kind === 'multiple') return { kind: 'multiple' };
  if (value.kind === 'none') return { kind: 'none' };
  throw new Error('invalid_support_snapshot');
}

function readHypothesisIds(value: unknown): string[] {
  if (!Array.isArray(value)
    || value.length < 2
    || !value.every(isNonEmptyIdentifier)) {
    throw new Error('invalid_support_snapshot');
  }
  const ids = value.map((id) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('invalid_support_snapshot');
  }
  for (let index = 1; index < ids.length; index += 1) {
    if (comparePostgresCText(ids[index - 1], ids[index]) >= 0) {
      throw new Error('invalid_support_snapshot');
    }
  }
  return ids;
}

function isRecurrence(
  value: unknown,
): value is EvidenceSelection['recurrence'] {
  return value === 'once' || value === 'repeated' || value === 'unknown';
}

function isKnownFacts(
  value: unknown,
): value is EvidenceSelection['knownFacts'] {
  return value === 'clear' || value === 'partial' || value === 'none-yet';
}

function isAssumptions(
  value: unknown,
): value is EvidenceSelection['assumptions'] {
  return value === 'present'
    || value === 'none-known'
    || value === 'uncertain';
}

function isDanger(
  value: unknown,
): value is EvidenceSelection['danger'] {
  return value === 'none-known'
    || value === 'uncertain'
    || value === 'present';
}

function isDirectlySolvable(
  value: unknown,
): value is EvidenceSelection['directlySolvable'] {
  return value === 'yes'
    || value === 'partly'
    || value === 'no'
    || value === 'unknown';
}

function isNextNeed(
  value: unknown,
): value is EvidenceSelection['nextNeed'] {
  return value === 'stabilize'
    || value === 'verify'
    || value === 'solve'
    || value === 'boundary'
    || value === 'help';
}

function readEvidence(value: unknown): EvidenceSelection {
  if (!hasExactKeys(value, [
    'assumptions',
    'danger',
    'directlySolvable',
    'knownFacts',
    'nextNeed',
    'recurrence',
  ])
    || !isRecurrence(value.recurrence)
    || !isKnownFacts(value.knownFacts)
    || !isAssumptions(value.assumptions)
    || !isDanger(value.danger)
    || !isDirectlySolvable(value.directlySolvable)
    || !isNextNeed(value.nextNeed)) {
    throw new Error('invalid_support_snapshot');
  }
  if (value.danger === 'present') {
    throw new Error('safety_required');
  }
  return {
    recurrence: value.recurrence,
    knownFacts: value.knownFacts,
    assumptions: value.assumptions,
    danger: value.danger,
    directlySolvable: value.directlySolvable,
    nextNeed: value.nextNeed,
  };
}

export function normalizeSupportNote(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    throw new Error('invalid_support_note');
  }
  const normalized = value.normalize('NFC').trim();
  if (normalized.length === 0) return undefined;
  if (containsC0OrC1Control(normalized)
    || bidiControlPattern.test(normalized)) {
    throw new Error('note_invalid_characters');
  }
  if (codePointLength(normalized) > 200) {
    throw new Error('note_too_long');
  }
  if (new TextEncoder().encode(normalized).length > 800) {
    throw new Error('note_too_long');
  }
  return normalized;
}

export function parseSupportSnapshot(value: unknown): SupportSnapshot {
  if (!hasExactKeys(value, [
    'evidence',
    'sceneVersionId',
    'selectedHypothesisIds',
    'selectedThought',
  ])
    || !isSupportUuid(value.sceneVersionId)) {
    throw new Error('invalid_support_snapshot');
  }
  const snapshot: SupportSnapshot = {
    sceneVersionId: value.sceneVersionId,
    selectedThought: readFirstThought(value.selectedThought),
    selectedHypothesisIds: readHypothesisIds(
      value.selectedHypothesisIds,
    ),
    evidence: readEvidence(value.evidence),
  };
  if (supportSnapshotCompactUtf8ByteLength(snapshot) > 16 * 1024) {
    throw new Error('invalid_support_snapshot');
  }
  return snapshot;
}

function readOptionalNote(
  value: Record<string, unknown>,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, 'note')) return undefined;
  return normalizeSupportNote(value.note);
}

export function parseSupportTicketInput(
  value: unknown,
): SupportTicketInput {
  if (!isPlainObject(value) || !isSupportUuid(value.requestId)) {
    throw new Error('invalid_support_ticket_input');
  }
  if (value.kind === 'no_snapshot') {
    const keys = Object.prototype.hasOwnProperty.call(value, 'note')
      ? ['kind', 'note', 'requestId']
      : ['kind', 'requestId'];
    if (!hasExactKeys(value, keys)) {
      throw new Error('invalid_support_ticket_input');
    }
    const note = readOptionalNote(value);
    if (note === undefined) {
      return {
        kind: 'no_snapshot',
        requestId: value.requestId,
      };
    }
    return {
      kind: 'no_snapshot',
      requestId: value.requestId,
      note,
    };
  }

  if (value.kind !== 'current_training_snapshot') {
    throw new Error('invalid_support_ticket_input');
  }
  const keys = Object.prototype.hasOwnProperty.call(value, 'note')
    ? [
      'completionId',
      'consentToShare',
      'kind',
      'note',
      'requestId',
      'snapshot',
    ]
    : [
      'completionId',
      'consentToShare',
      'kind',
      'requestId',
      'snapshot',
    ];
  if (!hasExactKeys(value, keys)
    || value.consentToShare !== true
    || !isSupportUuid(value.completionId)) {
    throw new Error('invalid_support_ticket_input');
  }

  const snapshot = parseSupportSnapshot(value.snapshot);
  const note = readOptionalNote(value);
  if (note === undefined) {
    return {
      kind: 'current_training_snapshot',
      requestId: value.requestId,
      consentToShare: true,
      completionId: value.completionId,
      snapshot,
    };
  }
  return {
    kind: 'current_training_snapshot',
    requestId: value.requestId,
    consentToShare: true,
    completionId: value.completionId,
    snapshot,
    note,
  };
}

export function parseSafetyReportInput(
  value: unknown,
): SafetyReportInput {
  if (!isPlainObject(value)
    || !isSupportUuid(value.requestId)
    || value.confirmedByUser !== true
    || !isPlainObject(value.context)) {
    throw new Error('invalid_safety_report_input');
  }

  const hasSession = Object.prototype.hasOwnProperty.call(value, 'sessionId');
  const outerKeys = hasSession
    ? ['confirmedByUser', 'context', 'requestId', 'sessionId']
    : ['confirmedByUser', 'context', 'requestId'];
  if (!hasExactKeys(value, outerKeys)
    || (hasSession && !isSupportUuid(value.sessionId))) {
    throw new Error('invalid_safety_report_input');
  }

  if (value.context.source === 'server') {
    if (!hasSession
      || !hasExactKeys(value.context, ['source'])
      || !isSupportUuid(value.sessionId)) {
      throw new Error('invalid_safety_report_input');
    }
    return {
      requestId: value.requestId,
      confirmedByUser: true,
      sessionId: value.sessionId,
      context: { source: 'server' },
    };
  }

  if (value.context.source !== 'user'
    || !hasExactKeys(value.context, ['signalCode', 'source'])
    || !isSafetySignal(value.context.signalCode)) {
    throw new Error('invalid_safety_report_input');
  }
  const context: {
    source: 'user';
    signalCode: SafetySignalCode;
  } = {
    source: 'user',
    signalCode: value.context.signalCode,
  };
  if (!hasSession) {
    return {
      requestId: value.requestId,
      confirmedByUser: true,
      context,
    };
  }
  if (!isSupportUuid(value.sessionId)) {
    throw new Error('invalid_safety_report_input');
  }
  return {
    requestId: value.requestId,
    confirmedByUser: true,
    sessionId: value.sessionId,
    context,
  };
}

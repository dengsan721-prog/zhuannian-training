import { describe, expect, it } from 'vitest';
import {
  isSupportUuid,
  normalizeSupportNote,
  parseSafetyReportInput,
  parseSupportSnapshot,
  parseSupportTicketInput,
} from './validation';
import { supportSnapshotCompactUtf8ByteLength } from './snapshotEncoding';
import type { SupportSnapshot } from './types';

const requestId = '30000000-0000-4000-8000-000000000001';
const completionId = '40000000-0000-4000-8000-000000000001';
const sessionId = '50000000-0000-4000-8000-000000000001';
const sceneVersionId = '60000000-0000-4000-8000-000000000001';

function validSnapshot(): SupportSnapshot {
  return {
    sceneVersionId,
    selectedThought: { kind: 'option', optionId: 'disrespect' },
    selectedHypothesisIds: ['need-autonomy', 'rule-boundary'],
    evidence: {
      recurrence: 'repeated',
      knownFacts: 'partial',
      assumptions: 'present',
      danger: 'none-known',
      directlySolvable: 'partly',
      nextNeed: 'boundary',
    },
  };
}

function snapshotAtSerializedBytes(byteLength: number) {
  const snapshot = validSnapshot();
  snapshot.selectedThought = { kind: 'option', optionId: '' };
  const fixedBytes = supportSnapshotCompactUtf8ByteLength(snapshot);
  snapshot.selectedThought = {
    kind: 'option',
    optionId: 'a'.repeat(byteLength - fixedBytes),
  };
  return snapshot;
}

describe('support UUID validation', () => {
  it.each([
    '00000000-0000-1000-8000-000000000000',
    '00000000-0000-2000-9000-000000000000',
    '00000000-0000-3000-a000-000000000000',
    '00000000-0000-4000-b000-000000000000',
    '00000000-0000-5000-8000-000000000000',
    '00000000-0000-6000-9000-000000000000',
    '00000000-0000-7000-a000-000000000000',
    '00000000-0000-8000-b000-000000000000',
  ])('accepts UUID version and variant contract: %s', (value) => {
    expect(isSupportUuid(value)).toBe(true);
  });

  it.each([
    '00000000-0000-0000-8000-000000000000',
    '00000000-0000-9000-8000-000000000000',
    '00000000-0000-4000-7000-000000000000',
    '00000000-0000-4000-c000-000000000000',
    '00000000000040008000000000000000',
  ])('rejects UUIDs outside the database contract: %s', (value) => {
    expect(isSupportUuid(value)).toBe(false);
  });
});

describe('support note validation', () => {
  it('normalizes to NFC, trims once, and omits an empty result', () => {
    expect(normalizeSupportNote('  Cafe\u0301  ')).toBe('Café');
    expect(normalizeSupportNote(' \u3000 ')).toBeUndefined();
  });

  it('accepts the 200-code-point and 800-byte boundaries', () => {
    expect(normalizeSupportNote('家'.repeat(200))).toBe('家'.repeat(200));
    expect(normalizeSupportNote('🙂'.repeat(200))).toBe('🙂'.repeat(200));
    expect(normalizeSupportNote('家🙂'.repeat(100)))
      .toBe('家🙂'.repeat(100));
  });

  it('rejects 201 code points, controls, and bidi controls', () => {
    expect(() => normalizeSupportNote('家'.repeat(201)))
      .toThrow('note_too_long');
    expect(() => normalizeSupportNote(`两行\n内容`))
      .toThrow('note_invalid_characters');
    expect(() => normalizeSupportNote('普通\u0085内容'))
      .toThrow('note_invalid_characters');
    expect(() => normalizeSupportNote('普通\u202e内容'))
      .toThrow('note_invalid_characters');
    expect(() => normalizeSupportNote('普通\u2066内容'))
      .toThrow('note_invalid_characters');
  });

  it('rejects a present non-string note', () => {
    expect(() => normalizeSupportNote(1)).toThrow('invalid_support_note');
  });
});

describe('support ticket validation', () => {
  it('accepts and newly maps the no-snapshot branch', () => {
    const input = {
      kind: 'no_snapshot',
      requestId,
      note: '  Cafe\u0301  ',
    };

    const result = parseSupportTicketInput(input);

    expect(result).toEqual({
      kind: 'no_snapshot',
      requestId,
      note: 'Café',
    });
    expect(result).not.toBe(input);
  });

  it('omits an empty normalized note', () => {
    expect(parseSupportTicketInput({
      kind: 'no_snapshot',
      requestId,
      note: '   ',
    })).toEqual({ kind: 'no_snapshot', requestId });
  });

  it('accepts and deeply clones the current-snapshot branch', () => {
    const snapshot = validSnapshot();
    const input = {
      kind: 'current_training_snapshot',
      requestId,
      consentToShare: true,
      completionId,
      snapshot,
    };

    const result = parseSupportTicketInput(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    if (result.kind !== 'current_training_snapshot') {
      throw new Error('expected current snapshot');
    }
    expect(result.snapshot).not.toBe(snapshot);
    expect(result.snapshot.selectedThought).not.toBe(snapshot.selectedThought);
    expect(result.snapshot.selectedHypothesisIds)
      .not.toBe(snapshot.selectedHypothesisIds);
    expect(result.snapshot.evidence).not.toBe(snapshot.evidence);
  });

  it.each([
    ['missing request ID', { kind: 'no_snapshot' }],
    ['extra no-snapshot consent', {
      kind: 'no_snapshot',
      requestId,
      consentToShare: false,
    }],
    ['extra no-snapshot completion', {
      kind: 'no_snapshot',
      requestId,
      completionId,
    }],
    ['extra no-snapshot snapshot', {
      kind: 'no_snapshot',
      requestId,
      snapshot: validSnapshot(),
    }],
    ['missing snapshot consent', {
      kind: 'current_training_snapshot',
      requestId,
      completionId,
      snapshot: validSnapshot(),
    }],
    ['false snapshot consent', {
      kind: 'current_training_snapshot',
      requestId,
      consentToShare: false,
      completionId,
      snapshot: validSnapshot(),
    }],
    ['extra snapshot field', {
      kind: 'current_training_snapshot',
      requestId,
      consentToShare: true,
      completionId,
      snapshot: validSnapshot(),
      userId: requestId,
    }],
    ['invalid request UUID', {
      kind: 'no_snapshot',
      requestId: 'request-1',
    }],
    ['invalid completion UUID', {
      kind: 'current_training_snapshot',
      requestId,
      consentToShare: true,
      completionId: 'completion-1',
      snapshot: validSnapshot(),
    }],
    ['an array', []],
  ])('rejects %s', (_label, input) => {
    expect(() => parseSupportTicketInput(input))
      .toThrow('invalid_support_ticket_input');
  });

  it('rejects class instances rather than accepting inherited behavior', () => {
    class TicketInput {
      kind = 'no_snapshot';
      requestId = requestId;
    }

    expect(() => parseSupportTicketInput(new TicketInput()))
      .toThrow('invalid_support_ticket_input');
  });
});

describe('support snapshot validation', () => {
  it('accepts 16 KiB and rejects one additional canonical UTF-8 byte', () => {
    const atLimit = snapshotAtSerializedBytes(16 * 1024);
    const overLimit = snapshotAtSerializedBytes((16 * 1024) + 1);

    expect(supportSnapshotCompactUtf8ByteLength(atLimit))
      .toBe(16 * 1024);
    expect(() => parseSupportSnapshot(atLimit)).not.toThrow();
    expect(() => parseSupportSnapshot(overLimit))
      .toThrow('invalid_support_snapshot');
  });

  it('uses PostgreSQL C UTF-8 byte order for BMP and astral IDs', () => {
    const bmp = '\ue000';
    const astral = '\u{10000}';

    expect(() => parseSupportSnapshot({
      ...validSnapshot(),
      selectedHypothesisIds: [bmp, astral],
    })).not.toThrow();
    expect(() => parseSupportSnapshot({
      ...validSnapshot(),
      selectedHypothesisIds: [astral, bmp],
    })).toThrow('invalid_support_snapshot');
  });

  it.each([
    { kind: 'uncertain' },
    { kind: 'multiple' },
    { kind: 'none' },
  ])('accepts the exact $kind first-thought branch', (selectedThought) => {
    expect(parseSupportSnapshot({
      ...validSnapshot(),
      selectedThought,
    }).selectedThought).toEqual(selectedThought);
  });

  it.each([
    ['extra snapshot key', {
      ...validSnapshot(),
      predictedResponse: 'private',
    }],
    ['extra thought key', {
      ...validSnapshot(),
      selectedThought: {
        kind: 'option',
        optionId: 'disrespect',
        label: 'authored prose',
      },
    }],
    ['missing option ID', {
      ...validSnapshot(),
      selectedThought: { kind: 'option' },
    }],
    ['extra uncertain key', {
      ...validSnapshot(),
      selectedThought: { kind: 'uncertain', optionId: 'private' },
    }],
    ['unknown first thought', {
      ...validSnapshot(),
      selectedThought: { kind: 'other' },
    }],
    ['fewer than two hypotheses', {
      ...validSnapshot(),
      selectedHypothesisIds: ['need-autonomy'],
    }],
    ['duplicate hypotheses', {
      ...validSnapshot(),
      selectedHypothesisIds: ['need-autonomy', 'need-autonomy'],
    }],
    ['unsorted hypotheses', {
      ...validSnapshot(),
      selectedHypothesisIds: ['rule-boundary', 'need-autonomy'],
    }],
    ['extra evidence key', {
      ...validSnapshot(),
      evidence: {
        ...validSnapshot().evidence,
        answer: 'private',
      },
    }],
    ['unknown evidence enum', {
      ...validSnapshot(),
      evidence: {
        ...validSnapshot().evidence,
        nextNeed: 'rescue',
      },
    }],
    ['invalid scene UUID', {
      ...validSnapshot(),
      sceneVersionId: 'scene-1',
    }],
  ])('rejects %s', (_label, snapshot) => {
    expect(() => parseSupportSnapshot(snapshot))
      .toThrow('invalid_support_snapshot');
  });

  it('routes danger-present evidence through a stable safety surface', () => {
    const snapshot = validSnapshot();
    snapshot.evidence.danger = 'present';

    expect(() => parseSupportSnapshot(snapshot)).toThrow('safety_required');
  });
});

describe('safety report validation', () => {
  it.each([
    'physical_or_sexual_violence',
    'serious_threat',
    'coercive_control',
    'child_abuse_or_exploitation',
    'self_harm_or_suicide',
    'bullying_or_retaliation',
    'medical_emergency',
    'user_declared_danger',
  ])('accepts the controlled %s signal', (signalCode) => {
    expect(parseSafetyReportInput({
      requestId,
      confirmedByUser: true,
      context: {
        source: 'user',
        signalCode,
      },
    })).toEqual({
      requestId,
      confirmedByUser: true,
      context: {
        source: 'user',
        signalCode,
      },
    });
  });

  it.each([
    {
      requestId,
      confirmedByUser: true,
      sessionId,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    },
    {
      requestId,
      confirmedByUser: true,
      sessionId,
      context: { source: 'server' },
    },
    {
      requestId,
      confirmedByUser: true,
      context: {
        source: 'user',
        signalCode: 'medical_emergency',
      },
    },
  ])('accepts and newly maps a valid union branch', (input) => {
    const result = parseSafetyReportInput(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.context).not.toBe(input.context);
  });

  it.each([
    ['confirmation missing', {
      requestId,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }],
    ['confirmation false', {
      requestId,
      confirmedByUser: false,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }],
    ['server source without session', {
      requestId,
      confirmedByUser: true,
      context: { source: 'server' },
    }],
    ['server source with signal', {
      requestId,
      confirmedByUser: true,
      sessionId,
      context: {
        source: 'server',
        signalCode: 'serious_threat',
      },
    }],
    ['user source without signal', {
      requestId,
      confirmedByUser: true,
      context: { source: 'user' },
    }],
    ['unknown user signal', {
      requestId,
      confirmedByUser: true,
      context: {
        source: 'user',
        signalCode: 'priority',
      },
    }],
    ['client scene identifier', {
      requestId,
      confirmedByUser: true,
      sceneVersionId,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }],
    ['client cohort identifier', {
      requestId,
      confirmedByUser: true,
      cohortId: sceneVersionId,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }],
    ['priority flag', {
      requestId,
      confirmedByUser: true,
      priority: 'urgent',
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }],
    ['invalid request UUID', {
      requestId: 'request-1',
      confirmedByUser: true,
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }],
    ['invalid session UUID', {
      requestId,
      confirmedByUser: true,
      sessionId: 'session-1',
      context: {
        source: 'user',
        signalCode: 'serious_threat',
      },
    }],
  ])('rejects %s', (_label, input) => {
    expect(() => parseSafetyReportInput(input))
      .toThrow('invalid_safety_report_input');
  });
});

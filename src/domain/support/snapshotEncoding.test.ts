import { describe, expect, it } from 'vitest';
import type { SupportSnapshot } from './types';
import {
  serializeSupportSnapshotCompact,
  supportSnapshotCompactUtf8ByteLength,
} from './snapshotEncoding';

const snapshot: SupportSnapshot = {
  sceneVersionId: '60000000-0000-4000-8000-000000000001',
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

describe('compact support snapshot encoding', () => {
  it('uses the fixed lower-camel key order with no structural whitespace', () => {
    expect(serializeSupportSnapshotCompact(snapshot)).toBe(
      '{"sceneVersionId":"60000000-0000-4000-8000-000000000001",'
      + '"selectedThought":{"kind":"option","optionId":"disrespect"},'
      + '"selectedHypothesisIds":["need-autonomy","rule-boundary"],'
      + '"evidence":{"recurrence":"repeated","knownFacts":"partial",'
      + '"assumptions":"present","danger":"none-known",'
      + '"directlySolvable":"partly","nextNeed":"boundary"}}',
    );
  });

  it('uses JSON scalar escaping and counts the compact UTF-8 bytes', () => {
    const escaped: SupportSnapshot = {
      ...snapshot,
      selectedThought: {
        kind: 'option',
        optionId: '引号" 反斜线\\ 🙂',
      },
    };
    const compact = serializeSupportSnapshotCompact(escaped);

    expect(compact).toContain('"optionId":"引号\\" 反斜线\\\\ 🙂"');
    expect(supportSnapshotCompactUtf8ByteLength(escaped)).toBe(
      new TextEncoder().encode(compact).length,
    );
  });

  it.each([
    { kind: 'uncertain' },
    { kind: 'multiple' },
    { kind: 'none' },
  ] as const)('encodes the exact $kind thought branch', (selectedThought) => {
    const compact = serializeSupportSnapshotCompact({
      ...snapshot,
      selectedThought,
    });

    expect(compact).toContain(
      `"selectedThought":{"kind":"${selectedThought.kind}"}`,
    );
    expect(compact).not.toContain('"optionId"');
  });
});

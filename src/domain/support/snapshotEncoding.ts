import type { FirstThoughtSelection } from '../training/types';
import type { SupportSnapshot } from './types';

function serializeJsonString(value: string): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('invalid_support_snapshot');
  }
  return serialized;
}

function serializeSelectedThought(
  value: FirstThoughtSelection,
): string {
  if (value.kind === 'option') {
    return '{"kind":"option","optionId":'
      + serializeJsonString(value.optionId)
      + '}';
  }
  return `{"kind":"${value.kind}"}`;
}

export function serializeSupportSnapshotCompact(
  snapshot: SupportSnapshot,
): string {
  const hypothesisIds = snapshot.selectedHypothesisIds
    .map(serializeJsonString)
    .join(',');

  return '{"sceneVersionId":'
    + serializeJsonString(snapshot.sceneVersionId)
    + ',"selectedThought":'
    + serializeSelectedThought(snapshot.selectedThought)
    + ',"selectedHypothesisIds":['
    + hypothesisIds
    + '],"evidence":{"recurrence":'
    + serializeJsonString(snapshot.evidence.recurrence)
    + ',"knownFacts":'
    + serializeJsonString(snapshot.evidence.knownFacts)
    + ',"assumptions":'
    + serializeJsonString(snapshot.evidence.assumptions)
    + ',"danger":'
    + serializeJsonString(snapshot.evidence.danger)
    + ',"directlySolvable":'
    + serializeJsonString(snapshot.evidence.directlySolvable)
    + ',"nextNeed":'
    + serializeJsonString(snapshot.evidence.nextNeed)
    + '}}';
}

export function supportSnapshotCompactUtf8ByteLength(
  snapshot: SupportSnapshot,
): number {
  return new TextEncoder().encode(
    serializeSupportSnapshotCompact(snapshot),
  ).length;
}

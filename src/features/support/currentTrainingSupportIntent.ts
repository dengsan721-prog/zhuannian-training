import type { EvidenceCheckId } from '../../domain/scenes/types';
import type { SupportSnapshot } from '../../domain/support/types';
import {
  comparePostgresCText,
  isSupportUuid,
  parseSupportSnapshot,
} from '../../domain/support/validation';
import type {
  EvidenceSelection,
  FirstThoughtSelection,
  TrainingDraft,
} from '../../domain/training/types';

export type SupportConsentPreview = {
  sceneLabel: string;
  sceneStorageNotice: string;
  selectedThoughtLabel: string;
  selectedHypothesisTexts: string[];
  evidence: Array<{
    id: EvidenceCheckId;
    question: string;
    answer: string;
  }>;
  exclusionNotice: string;
};

export type CurrentTrainingSupportIntent = {
  ownerUserId: string;
  completionId: string;
  snapshot: SupportSnapshot;
  preview: SupportConsentPreview;
};

export type PeekedCurrentTrainingSupportIntent = {
  token: string;
  intent: CurrentTrainingSupportIntent;
};

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

type SupportSourceScene = {
  id: string;
  title: string;
  sceneCode: string;
  version: number;
  thoughtOptions: unknown[];
  predictionOptions: unknown[];
  hypotheses: unknown[];
  evidenceChecks: unknown[];
};

function readScene(value: unknown): SupportSourceScene {
  if (!isPlainObject(value)
    || !isSupportUuid(value.id)
    || !isSupportUuid(value.sceneId)
    || value.status !== 'published'
    || (value.riskLevel !== 'standard' && value.riskLevel !== 'caution')
    || typeof value.title !== 'string'
    || value.title.length === 0
    || typeof value.sceneCode !== 'string'
    || !/^(PC|FR)-\d{3}$/.test(value.sceneCode)
    || typeof value.version !== 'number'
    || !Number.isInteger(value.version)
    || value.version < 1
    || !Array.isArray(value.thoughtOptions)
    || !Array.isArray(value.predictionOptions)
    || value.predictionOptions.length === 0
    || !value.predictionOptions.every((item) => (
      typeof item === 'string' && item.length > 0
    ))
    || !Array.isArray(value.hypotheses)
    || !Array.isArray(value.evidenceChecks)) {
    throw new Error('invalid_support_intent');
  }
  return {
    id: value.id,
    title: value.title,
    sceneCode: value.sceneCode,
    version: value.version,
    thoughtOptions: value.thoughtOptions.map((item) => item),
    predictionOptions: value.predictionOptions.map((item) => item),
    hypotheses: value.hypotheses.map((item) => item),
    evidenceChecks: value.evidenceChecks.map((item) => item),
  };
}

function readSelectedThought(
  value: unknown,
  scene: SupportSourceScene,
): {
  selection: FirstThoughtSelection;
  label: string;
} {
  if (!isPlainObject(value)) {
    throw new Error('invalid_support_intent');
  }
  if (value.kind === 'option') {
    if (!hasExactKeys(value, ['kind', 'optionId'])
      || typeof value.optionId !== 'string') {
      throw new Error('invalid_support_intent');
    }
    let matchedCount = 0;
    let matchedLabel = '';
    for (const option of scene.thoughtOptions) {
      if (!isPlainObject(option) || option.id !== value.optionId) continue;
      matchedCount += 1;
      if (typeof option.label !== 'string' || option.label.length === 0) {
        throw new Error('invalid_support_intent');
      }
      matchedLabel = option.label;
    }
    if (matchedCount !== 1) {
      throw new Error('invalid_support_intent');
    }
    return {
      selection: {
        kind: 'option',
        optionId: value.optionId,
      },
      label: matchedLabel,
    };
  }
  if (!hasExactKeys(value, ['kind'])) {
    throw new Error('invalid_support_intent');
  }
  if (value.kind === 'uncertain') {
    return {
      selection: { kind: 'uncertain' },
      label: '不确定',
    };
  }
  if (value.kind === 'multiple') {
    return {
      selection: { kind: 'multiple' },
      label: '多个都可能',
    };
  }
  if (value.kind === 'none') {
    return {
      selection: { kind: 'none' },
      label: '以上都不符合',
    };
  }
  throw new Error('invalid_support_intent');
}

function readHypotheses(
  value: unknown,
  scene: SupportSourceScene,
): {
  ids: string[];
  texts: string[];
} {
  if (!Array.isArray(value)
    || value.length < 2
    || !value.every((id) => typeof id === 'string' && id.length > 0)
    || new Set(value).size !== value.length) {
    throw new Error('invalid_support_intent');
  }

  const selected = value.map((id) => id).sort(comparePostgresCText);
  const texts: string[] = [];
  for (const id of selected) {
    let matchedCount = 0;
    let matchedText = '';
    for (const hypothesis of scene.hypotheses) {
      if (!isPlainObject(hypothesis) || hypothesis.id !== id) continue;
      matchedCount += 1;
      if (typeof hypothesis.text !== 'string'
        || hypothesis.text.length === 0) {
        throw new Error('invalid_support_intent');
      }
      matchedText = hypothesis.text;
    }
    if (matchedCount !== 1) {
      throw new Error('invalid_support_intent');
    }
    texts.push(matchedText);
  }
  return { ids: selected, texts };
}

function validatePredictedResponse(
  value: unknown,
  scene: SupportSourceScene,
): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('invalid_support_intent');
  }
  let matchedCount = 0;
  for (const response of scene.predictionOptions) {
    if (response === value) matchedCount += 1;
  }
  if (matchedCount !== 1) {
    throw new Error('invalid_support_intent');
  }
}

function isEvidenceCheckId(value: unknown): value is EvidenceCheckId {
  return value === 'recurrence'
    || value === 'known-facts'
    || value === 'assumptions'
    || value === 'danger'
    || value === 'directly-solvable'
    || value === 'next-need';
}

function evidenceQuestion(id: EvidenceCheckId): string {
  if (id === 'recurrence') return '这件事发生的频率';
  if (id === 'known-facts') return '已经掌握的事实';
  if (id === 'assumptions') return '事实与推测';
  if (id === 'danger') return '安全情况';
  if (id === 'directly-solvable') return '可以直接处理多少';
  return '下一步最需要什么';
}

function evidenceAnswer(
  id: EvidenceCheckId,
  evidence: EvidenceSelection,
): string {
  if (id === 'recurrence') {
    if (evidence.recurrence === 'once') return '目前只发生一次';
    if (evidence.recurrence === 'repeated') return '反复发生';
    return '还不能确定';
  }
  if (id === 'known-facts') {
    if (evidence.knownFacts === 'clear') return '我掌握了一些明确事实';
    if (evidence.knownFacts === 'partial') return '只有部分事实';
    return '还没有足够事实';
  }
  if (id === 'assumptions') {
    if (evidence.assumptions === 'present') return '其中有我的推测';
    if (evidence.assumptions === 'none-known') return '目前没有发现推测';
    return '我还分不清';
  }
  if (id === 'danger') {
    if (evidence.danger === 'none-known') {
      return '目前没有发现威胁、控制或伤害';
    }
    if (evidence.danger === 'uncertain') return '我不确定是否安全';
    throw new Error('safety_required');
  }
  if (id === 'directly-solvable') {
    if (evidence.directlySolvable === 'yes') return '可以直接解决';
    if (evidence.directlySolvable === 'partly') return '可以先解决一部分';
    if (evidence.directlySolvable === 'no') return '暂时不能直接解决';
    return '还不能确定';
  }
  if (evidence.nextNeed === 'stabilize') return '先稳定自己';
  if (evidence.nextNeed === 'verify') return '先核对事实';
  if (evidence.nextNeed === 'solve') return '先处理可控部分';
  if (evidence.nextNeed === 'boundary') return '先设边界';
  return '先寻求帮助';
}

function buildEvidencePreview(
  scene: SupportSourceScene,
  evidence: EvidenceSelection,
): SupportConsentPreview['evidence'] {
  if (scene.evidenceChecks.length !== 6) {
    throw new Error('invalid_support_intent');
  }
  const seen = new Set<EvidenceCheckId>();
  const preview: SupportConsentPreview['evidence'] = [];
  for (const check of scene.evidenceChecks) {
    if (!isPlainObject(check)
      || !isEvidenceCheckId(check.id)
      || typeof check.prompt !== 'string'
      || check.prompt.length === 0
      || seen.has(check.id)) {
      throw new Error('invalid_support_intent');
    }
    seen.add(check.id);
    preview.push({
      id: check.id,
      question: evidenceQuestion(check.id),
      answer: evidenceAnswer(check.id, evidence),
    });
  }
  if (seen.size !== 6) {
    throw new Error('invalid_support_intent');
  }
  return preview;
}

function buildPreview(
  scene: SupportSourceScene,
  selectedThoughtLabel: string,
  selectedHypothesisTexts: string[],
  evidence: EvidenceSelection,
): SupportConsentPreview {
  return {
    sceneLabel: `场景：${scene.title}（${scene.sceneCode}，第 ${scene.version} 版）`,
    sceneStorageNotice:
      `提交时只存储场景版本标识 ${scene.id}，不存储完整场景内容。`,
    selectedThoughtLabel,
    selectedHypothesisTexts: selectedHypothesisTexts.map((text) => text),
    evidence: buildEvidencePreview(scene, evidence),
    exclusionNotice:
      '不会分享预测回应、系统反馈、边界文字、新表达、微行动、备用方案、积分或完整场景。',
  };
}

function clonePreview(value: SupportConsentPreview): SupportConsentPreview {
  return {
    sceneLabel: value.sceneLabel,
    sceneStorageNotice: value.sceneStorageNotice,
    selectedThoughtLabel: value.selectedThoughtLabel,
    selectedHypothesisTexts:
      value.selectedHypothesisTexts.map((text) => text),
    evidence: value.evidence.map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
    })),
    exclusionNotice: value.exclusionNotice,
  };
}

function readPreview(
  value: unknown,
  snapshot: SupportSnapshot,
): SupportConsentPreview {
  if (!hasExactKeys(value, [
    'evidence',
    'exclusionNotice',
    'sceneLabel',
    'sceneStorageNotice',
    'selectedHypothesisTexts',
    'selectedThoughtLabel',
  ])
    || typeof value.sceneLabel !== 'string'
    || value.sceneLabel.length === 0
    || typeof value.sceneStorageNotice !== 'string'
    || !value.sceneStorageNotice.includes(snapshot.sceneVersionId)
    || typeof value.selectedThoughtLabel !== 'string'
    || value.selectedThoughtLabel.length === 0
    || !Array.isArray(value.selectedHypothesisTexts)
    || value.selectedHypothesisTexts.length
      !== snapshot.selectedHypothesisIds.length
    || !value.selectedHypothesisTexts.every((text) => (
      typeof text === 'string' && text.length > 0
    ))
    || !Array.isArray(value.evidence)
    || value.evidence.length !== 6
    || typeof value.exclusionNotice !== 'string'
    || value.exclusionNotice.length === 0) {
    throw new Error('invalid_support_intent');
  }

  const evidence: SupportConsentPreview['evidence'] = [];
  const evidenceIds = new Set<EvidenceCheckId>();
  for (const item of value.evidence) {
    if (!hasExactKeys(item, ['answer', 'id', 'question'])
      || !isEvidenceCheckId(item.id)
      || evidenceIds.has(item.id)
      || typeof item.question !== 'string'
      || item.question.length === 0
      || typeof item.answer !== 'string'
      || item.answer.length === 0) {
      throw new Error('invalid_support_intent');
    }
    evidenceIds.add(item.id);
    evidence.push({
      id: item.id,
      question: item.question,
      answer: item.answer,
    });
  }
  if (evidenceIds.size !== 6) {
    throw new Error('invalid_support_intent');
  }
  return {
    sceneLabel: value.sceneLabel,
    sceneStorageNotice: value.sceneStorageNotice,
    selectedThoughtLabel: value.selectedThoughtLabel,
    selectedHypothesisTexts:
      value.selectedHypothesisTexts.map((text) => text),
    evidence,
    exclusionNotice: value.exclusionNotice,
  };
}

function readIntent(value: unknown): CurrentTrainingSupportIntent {
  if (!hasExactKeys(value, [
    'completionId',
    'ownerUserId',
    'preview',
    'snapshot',
  ])
    || !isSupportUuid(value.ownerUserId)
    || !isSupportUuid(value.completionId)) {
    throw new Error('invalid_support_intent');
  }
  let snapshot: SupportSnapshot;
  try {
    snapshot = parseSupportSnapshot(value.snapshot);
  } catch (error) {
    if (error instanceof Error && error.message === 'safety_required') {
      throw error;
    }
    throw new Error('invalid_support_intent', { cause: error });
  }
  return {
    ownerUserId: value.ownerUserId,
    completionId: value.completionId,
    snapshot,
    preview: readPreview(value.preview, snapshot),
  };
}

function cloneIntent(
  value: CurrentTrainingSupportIntent,
): CurrentTrainingSupportIntent {
  const snapshot = parseSupportSnapshot(value.snapshot);
  return {
    ownerUserId: value.ownerUserId,
    completionId: value.completionId,
    snapshot,
    preview: clonePreview(value.preview),
  };
}

export function buildCurrentTrainingSupportIntent(
  ownerUserId: string,
  completionId: string,
  completedDraft: TrainingDraft,
): CurrentTrainingSupportIntent {
  if (!isSupportUuid(ownerUserId)
    || !isSupportUuid(completionId)
    || !isPlainObject(completedDraft)) {
    throw new Error('invalid_support_intent');
  }
  if (completedDraft.userId !== ownerUserId
    || completedDraft.status !== 'completed'
    || completedDraft.expressionAccepted !== true
    || completedDraft.step !== 'expression-action'
    || typeof completedDraft.predictedResponse !== 'string') {
    throw new Error('support_source_unavailable');
  }
  if (completedDraft.schemaVersion !== 1
    || !isSupportUuid(completedDraft.sessionId)
    || !isSupportUuid(completedDraft.completionEventId)
    || completedDraft.safetySignalCode !== undefined) {
    throw new Error('invalid_support_intent');
  }

  const scene = readScene(completedDraft.scene);
  validatePredictedResponse(completedDraft.predictedResponse, scene);
  if (completedDraft.firstThought === undefined
    || completedDraft.evidence === undefined) {
    throw new Error('support_source_unavailable');
  }
  const selectedThought = readSelectedThought(
    completedDraft.firstThought,
    scene,
  );
  const selectedHypotheses = readHypotheses(
    completedDraft.selectedHypothesisIds,
    scene,
  );

  let snapshot: SupportSnapshot;
  try {
    snapshot = parseSupportSnapshot({
      sceneVersionId: scene.id,
      selectedThought: selectedThought.selection,
      selectedHypothesisIds: selectedHypotheses.ids,
      evidence: completedDraft.evidence,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'safety_required') {
      throw error;
    }
    throw new Error('invalid_support_intent', { cause: error });
  }

  return {
    ownerUserId,
    completionId,
    snapshot,
    preview: buildPreview(
      scene,
      selectedThought.label,
      selectedHypotheses.texts,
      snapshot.evidence,
    ),
  };
}

let currentSlot: PeekedCurrentTrainingSupportIntent | null = null;

export const currentTrainingSupportIntent = {
  set(value: CurrentTrainingSupportIntent): string {
    currentSlot = null;
    const intent = readIntent(value);
    const token = globalThis.crypto.randomUUID();
    currentSlot = {
      token,
      intent: cloneIntent(intent),
    };
    return token;
  },

  peek(ownerUserId: string): PeekedCurrentTrainingSupportIntent | null {
    if (currentSlot === null) return null;
    if (!isSupportUuid(ownerUserId)
      || currentSlot.intent.ownerUserId !== ownerUserId) {
      currentSlot = null;
      return null;
    }
    return {
      token: currentSlot.token,
      intent: cloneIntent(currentSlot.intent),
    };
  },

  clear(token: string): void {
    if (currentSlot?.token === token) {
      currentSlot = null;
    }
  },

  clearAll(): void {
    currentSlot = null;
  },
};

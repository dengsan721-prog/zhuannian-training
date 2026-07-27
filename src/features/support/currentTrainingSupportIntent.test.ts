import { createElement, createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EvidenceSelection,
  FirstThoughtSelection,
} from '../../domain/training/types';
import { validPublishedScene } from '../../test/fixtures/scene';
import {
  completedSupportTrainingDraft as completedSupportDraft,
  supportSceneVersionId,
} from '../../test/fixtures/support';
import {
  validEvidence,
} from '../../test/fixtures/training';
import { EvidenceBoundaryStep } from '../training/EvidenceBoundaryStep';
import { FirstThoughtStep } from '../training/FirstThoughtStep';
import {
  buildCurrentTrainingSupportIntent,
  currentTrainingSupportIntent,
} from './currentTrainingSupportIntent';

const ownerUserId = '00000000-0000-4000-8000-000000000101';
const otherUserId = '00000000-0000-4000-8000-000000000102';
const completionId = '50000000-0000-4000-8000-000000000011';

function draftWith(key: string, value: unknown) {
  const draft = completedSupportDraft();
  Reflect.set(draft, key, value);
  return draft;
}

function evidenceWith<Key extends keyof EvidenceSelection>(
  key: Key,
  value: EvidenceSelection[Key],
): EvidenceSelection {
  return {
    ...validEvidence,
    [key]: value,
  };
}

function completedDraftWithoutPrediction() {
  const draft = completedSupportDraft();
  delete draft.predictedResponse;
  return draft;
}

describe('buildCurrentTrainingSupportIntent', () => {
  it('builds a fresh canonical four-key snapshot from completed memory', () => {
    const draft = completedSupportDraft();

    const intent = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      draft,
    );

    expect(intent.ownerUserId).toBe(ownerUserId);
    expect(intent.completionId).toBe(completionId);
    expect(Object.keys(intent.snapshot).sort()).toEqual([
      'evidence',
      'sceneVersionId',
      'selectedHypothesisIds',
      'selectedThought',
    ]);
    expect(intent.snapshot).toEqual({
      sceneVersionId: supportSceneVersionId,
      selectedThought: { kind: 'option', optionId: 'disrespect' },
      selectedHypothesisIds: ['need-autonomy', 'rule-boundary'],
      evidence: validEvidence,
    });
    expect(intent.snapshot.selectedHypothesisIds)
      .not.toBe(draft.selectedHypothesisIds);
    expect(intent.snapshot.selectedThought).not.toBe(draft.firstThought);
    expect(intent.snapshot.evidence).not.toBe(draft.evidence);

    const serializedSnapshot = JSON.stringify(intent.snapshot);
    for (const prohibited of [
      '"predictedResponse":',
      '"feedback":',
      '"thoughtPath":',
      '"boundary":',
      '"newExpression":',
      '"microAction":',
      '"fallbackPlan":',
      '"expressionAccepted":',
      '"points":',
      validPublishedScene.title,
      validPublishedScene.boundary ?? '',
      validPublishedScene.newExpression ?? '',
    ]) {
      expect(serializedSnapshot).not.toContain(prohibited);
    }
  });

  it('canonicalizes hypothesis IDs with PostgreSQL C UTF-8 byte order', () => {
    const bmp = '\ue000';
    const astral = '\u{10000}';
    const draft = completedSupportDraft();
    draft.scene = {
      ...draft.scene,
      hypotheses: [
        { ...draft.scene.hypotheses[0], id: bmp },
        { ...draft.scene.hypotheses[1], id: astral },
        draft.scene.hypotheses[2],
      ],
    };
    draft.selectedHypothesisIds = [astral, bmp];

    const intent = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      draft,
    );

    expect(intent.snapshot.selectedHypothesisIds).toEqual([bmp, astral]);
    expect(intent.preview.selectedHypothesisTexts).toEqual([
      draft.scene.hypotheses[0].text,
      draft.scene.hypotheses[1].text,
    ]);
  });

  it('builds a Chinese in-memory preview for every shared field', () => {
    const intent = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );

    expect(intent.preview.sceneLabel).toContain(validPublishedScene.title);
    expect(intent.preview.sceneLabel).toContain(validPublishedScene.sceneCode);
    expect(intent.preview.sceneLabel).toContain('第 1 版');
    expect(intent.preview.sceneStorageNotice)
      .toContain(supportSceneVersionId);
    expect(intent.preview.sceneStorageNotice).toContain('只存储场景版本标识');
    expect(intent.preview.selectedThoughtLabel)
      .toBe('他根本没把我的话当回事');
    expect(intent.preview.selectedHypothesisTexts).toEqual([
      validPublishedScene.hypotheses[0].text,
      validPublishedScene.hypotheses[2].text,
    ]);
    expect(intent.preview.evidence).toHaveLength(6);
    expect(intent.preview.evidence.map((item) => item.question)).toEqual([
      '这件事发生的频率',
      '已经掌握的事实',
      '事实与推测',
      '安全情况',
      '可以直接处理多少',
      '下一步最需要什么',
    ]);
    expect(intent.preview.evidence.map((item) => item.answer)).toEqual([
      '反复发生',
      '只有部分事实',
      '其中有我的推测',
      '目前没有发现威胁、控制或伤害',
      '可以先解决一部分',
      '先设边界',
    ]);
    expect(intent.preview.exclusionNotice).toContain('不会分享');
    expect(intent.preview.exclusionNotice).toContain('完整场景');
    expect(intent.preview.exclusionNotice).toContain('积分');
  });

  it('uses the exact labels shown by FirstThoughtStep', () => {
    render(createElement(FirstThoughtStep, {
      scene: validPublishedScene,
      headingRef: createRef<HTMLHeadingElement>(),
      disabled: false,
      onContinue: vi.fn(),
      onPause: vi.fn(),
    }));
    const selections: FirstThoughtSelection[] = [
      { kind: 'option', optionId: 'disrespect' },
      { kind: 'uncertain' },
      { kind: 'multiple' },
      { kind: 'none' },
    ];

    for (const selection of selections) {
      const draft = completedSupportDraft();
      draft.firstThought = selection;
      const preview = buildCurrentTrainingSupportIntent(
        ownerUserId,
        completionId,
        draft,
      ).preview;

      expect(screen.getByLabelText(preview.selectedThoughtLabel))
        .toBeInTheDocument();
    }
  });

  it('uses the exact question and answer labels shown by EvidenceBoundaryStep', () => {
    render(createElement(EvidenceBoundaryStep, {
      headingRef: createRef<HTMLHeadingElement>(),
      disabled: false,
      onContinue: vi.fn(),
      onDanger: vi.fn(),
    }));
    const cases: Array<{
      index: number;
      evidence: EvidenceSelection;
    }> = [
      { index: 0, evidence: evidenceWith('recurrence', 'repeated') },
      { index: 0, evidence: evidenceWith('recurrence', 'once') },
      { index: 0, evidence: evidenceWith('recurrence', 'unknown') },
      { index: 1, evidence: evidenceWith('knownFacts', 'clear') },
      { index: 1, evidence: evidenceWith('knownFacts', 'partial') },
      { index: 1, evidence: evidenceWith('knownFacts', 'none-yet') },
      { index: 2, evidence: evidenceWith('assumptions', 'present') },
      { index: 2, evidence: evidenceWith('assumptions', 'none-known') },
      { index: 2, evidence: evidenceWith('assumptions', 'uncertain') },
      { index: 3, evidence: evidenceWith('danger', 'none-known') },
      { index: 3, evidence: evidenceWith('danger', 'uncertain') },
      { index: 4, evidence: evidenceWith('directlySolvable', 'partly') },
      { index: 4, evidence: evidenceWith('directlySolvable', 'yes') },
      { index: 4, evidence: evidenceWith('directlySolvable', 'no') },
      { index: 4, evidence: evidenceWith('directlySolvable', 'unknown') },
      { index: 5, evidence: evidenceWith('nextNeed', 'boundary') },
      { index: 5, evidence: evidenceWith('nextNeed', 'stabilize') },
      { index: 5, evidence: evidenceWith('nextNeed', 'verify') },
      { index: 5, evidence: evidenceWith('nextNeed', 'solve') },
      { index: 5, evidence: evidenceWith('nextNeed', 'help') },
    ];

    for (const item of cases) {
      const draft = completedSupportDraft();
      draft.evidence = item.evidence;
      const previewItem = buildCurrentTrainingSupportIntent(
        ownerUserId,
        completionId,
        draft,
      ).preview.evidence[item.index];
      const group = screen.getByRole('group', {
        name: previewItem.question,
      });

      expect(within(group).getByLabelText(previewItem.answer))
        .toBeInTheDocument();
    }
  });

  it('supports all exact first-thought union branches', () => {
    for (const selectedThought of [
      { kind: 'uncertain' },
      { kind: 'multiple' },
      { kind: 'none' },
    ] as const) {
      const draft = completedSupportDraft();
      draft.firstThought = selectedThought;

      const intent = buildCurrentTrainingSupportIntent(
        ownerUserId,
        completionId,
        draft,
      );

      expect(intent.snapshot.selectedThought).toEqual(selectedThought);
      expect(intent.snapshot.selectedThought).not.toBe(selectedThought);
      expect(intent.preview.selectedThoughtLabel).not.toBe('');
    }
  });

  it('rejects danger-present evidence through the safety route', () => {
    const draft = completedSupportDraft();
    draft.evidence = { ...validEvidence, danger: 'present' };

    expect(() => buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      draft,
    )).toThrow('safety_required');
  });

  it('rejects malformed evidence with the stable intent error', () => {
    const draft = completedSupportDraft();
    Reflect.set(draft, 'evidence', null);

    expect(() => buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      draft,
    )).toThrow('invalid_support_intent');
  });

  it('validates the pinned scene code used in the preview', () => {
    const draft = completedSupportDraft();
    draft.scene = {
      ...draft.scene,
      sceneCode: 'invalid-code',
    };

    expect(() => buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      draft,
    )).toThrow('invalid_support_intent');
  });

  it.each([
    ['owner mismatch', otherUserId, completionId, completedSupportDraft(),
      'support_source_unavailable'],
    ['invalid completion ID', ownerUserId, 'completion-1',
      completedSupportDraft(), 'invalid_support_intent'],
    ['not completed', ownerUserId, completionId,
      draftWith('status', 'active'), 'support_source_unavailable'],
    ['completion not accepted', ownerUserId, completionId,
      draftWith('expressionAccepted', false), 'support_source_unavailable'],
    ['unknown thought option', ownerUserId, completionId,
      draftWith('firstThought', {
        kind: 'option',
        optionId: 'not-authored',
      }), 'invalid_support_intent'],
    ['duplicate hypothesis', ownerUserId, completionId,
      draftWith('selectedHypothesisIds', [
        'need-autonomy',
        'need-autonomy',
      ]), 'invalid_support_intent'],
    ['unknown hypothesis', ownerUserId, completionId,
      draftWith('selectedHypothesisIds', [
        'need-autonomy',
        'not-authored',
      ]), 'invalid_support_intent'],
    ['wrong completed step', ownerUserId, completionId,
      draftWith('step', 'hypotheses'), 'support_source_unavailable'],
    ['missing prediction', ownerUserId, completionId,
      completedDraftWithoutPrediction(), 'support_source_unavailable'],
    ['unauthored prediction', ownerUserId, completionId,
      draftWith('predictedResponse', 'not-authored'),
      'invalid_support_intent'],
    ['safety signal on completed state', ownerUserId, completionId,
      draftWith('safetySignalCode', 'serious_threat'),
      'invalid_support_intent'],
    ['invalid completion event ID', ownerUserId, completionId,
      draftWith('completionEventId', 'event-1'),
      'invalid_support_intent'],
  ])('rejects %s', (
    _label,
    owner,
    completion,
    draft,
    error,
  ) => {
    expect(() => buildCurrentTrainingSupportIntent(
      owner,
      completion,
      draft,
    )).toThrow(error);
  });
});

describe('currentTrainingSupportIntent singleton', () => {
  beforeEach(() => {
    currentTrainingSupportIntent.clearAll();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('peeks non-destructively for StrictMode and token-clears on commit', () => {
    const built = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );
    const token = currentTrainingSupportIntent.set(built);

    const firstInitializer = currentTrainingSupportIntent.peek(ownerUserId);
    const secondInitializer = currentTrainingSupportIntent.peek(ownerUserId);

    expect(firstInitializer).not.toBeNull();
    expect(secondInitializer).not.toBeNull();
    expect(firstInitializer?.token).toBe(token);
    expect(secondInitializer?.token).toBe(token);
    expect(secondInitializer?.intent).toEqual(built);

    currentTrainingSupportIntent.clear(token);

    expect(currentTrainingSupportIntent.peek(ownerUserId)).toBeNull();
    expect(secondInitializer?.intent).toEqual(built);
  });

  it('deep-clones on set and every peek', () => {
    const built = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );
    currentTrainingSupportIntent.set(built);
    built.snapshot.selectedHypothesisIds.push('mutated');
    built.preview.selectedHypothesisTexts.push('mutated');

    const first = currentTrainingSupportIntent.peek(ownerUserId);
    if (!first) throw new Error('expected intent');
    first.intent.snapshot.selectedHypothesisIds.push('peek mutation');
    first.intent.preview.evidence[0].answer = 'peek mutation';

    const second = currentTrainingSupportIntent.peek(ownerUserId);
    expect(second?.intent.snapshot.selectedHypothesisIds).toEqual([
      'need-autonomy',
      'rule-boundary',
    ]);
    expect(second?.intent.preview.selectedHypothesisTexts).toHaveLength(2);
    expect(second?.intent.preview.evidence[0].answer).toBe('反复发生');
  });

  it('clears on owner mismatch and cannot be recovered by the owner', () => {
    const built = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );
    currentTrainingSupportIntent.set(built);

    expect(currentTrainingSupportIntent.peek(otherUserId)).toBeNull();
    expect(currentTrainingSupportIntent.peek(ownerUserId)).toBeNull();
  });

  it('does not let a stale token clear a later entry', () => {
    const built = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );
    const staleToken = currentTrainingSupportIntent.set(built);
    const currentToken = currentTrainingSupportIntent.set(built);

    currentTrainingSupportIntent.clear(staleToken);

    expect(currentTrainingSupportIntent.peek(ownerUserId)?.token)
      .toBe(currentToken);
  });

  it('never places the intent in browser storage', () => {
    const setSession = vi.spyOn(Storage.prototype, 'setItem');
    const built = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );

    currentTrainingSupportIntent.set(built);
    currentTrainingSupportIntent.peek(ownerUserId);

    expect(setSession).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('rejects spread-injected values instead of retaining them', () => {
    const built = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );

    const injected = {
      ...built,
      predictedResponse: 'private answer',
    };

    expect(() => currentTrainingSupportIntent.set(injected))
      .toThrow('invalid_support_intent');
    expect(currentTrainingSupportIntent.peek(ownerUserId)).toBeNull();
  });

  it('clears an older intent before rejecting a malformed later entry', () => {
    const built = buildCurrentTrainingSupportIntent(
      ownerUserId,
      completionId,
      completedSupportDraft(),
    );
    currentTrainingSupportIntent.set(built);
    const injected = {
      ...built,
      predictedResponse: 'private answer',
    };

    expect(() => currentTrainingSupportIntent.set(injected))
      .toThrow('invalid_support_intent');
    expect(currentTrainingSupportIntent.peek(ownerUserId)).toBeNull();
  });
});

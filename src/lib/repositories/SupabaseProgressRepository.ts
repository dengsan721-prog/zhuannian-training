import type { SupabaseClient } from '@supabase/supabase-js';
import {
  badgeLabels,
  badgeRules,
  surpriseRules,
} from '../../domain/progress/badges';
import type {
  ClassAggregate,
  CompletionResult,
  MilestoneBadge,
  PrivateProgress,
  ReviewInput,
  ReviewPrompt,
  ReviewResult,
  SavedInsightRoute,
  SavedInsightSummary,
  SetSavedInput,
  UnlockedSurprise,
} from '../../domain/progress/types';
import type { CompletionCommand } from '../../domain/training/types';
import type { ProgressRepository } from './ProgressRepository';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalBrowserTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const responseTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const completionCommandKeys = [
  'completedAt',
  'eventId',
  'sceneId',
  'sceneVersionId',
  'sessionId',
];
const reviewInputKeys = [
  'attempted',
  'completionId',
  'hypothesisResult',
  'idempotencyKey',
  'nextDirection',
  'observation',
];
const savedInputKeys = ['kind', 'saved', 'sceneVersionId'];

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
  const keys = Object.keys(value).sort();
  if (keys.length !== expectedKeys.length) return false;
  return keys.every((key, index) => key === expectedKeys[index]);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear = year % 4 === 0
      && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

function normalizeResponseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = responseTimestampPattern.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[10]);

  if (month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return timestamp.toISOString();
}

function isCanonicalBrowserTimestamp(value: unknown): value is string {
  if (typeof value !== 'string'
    || !canonicalBrowserTimestampPattern.test(value)) {
    return false;
  }
  return normalizeResponseTimestamp(value) === value;
}

function isInsightKind(
  value: unknown,
): value is SetSavedInput['kind'] {
  return value === 'reframe' || value === 'expression';
}

function isObservation(
  value: unknown,
): value is ReviewInput['observation'] {
  return value === 'helpful'
    || value === 'no_change'
    || value === 'not_tried'
    || value === 'needs_support';
}

function isHypothesisResult(
  value: unknown,
): value is ReviewInput['hypothesisResult'] {
  return value === 'supported'
    || value === 'unsupported'
    || value === 'uncertain';
}

function isNextDirection(
  value: unknown,
): value is ReviewInput['nextDirection'] {
  return value === 'repeat'
    || value === 'adjust'
    || value === 'boundary'
    || value === 'seek_help';
}

function isSavedRoute(
  value: unknown,
): value is SavedInsightRoute {
  return value === 'available'
    || value === 'content-update'
    || value === 'safety-stop';
}

function assertCompletionCommand(
  value: unknown,
): asserts value is CompletionCommand {
  if (!hasExactKeys(value, completionCommandKeys)
    || !isUuid(value.eventId)
    || !isUuid(value.sessionId)
    || !isUuid(value.sceneId)
    || !isUuid(value.sceneVersionId)
    || !isCanonicalBrowserTimestamp(value.completedAt)) {
    throw new Error('invalid_progress_input');
  }
}

function assertReviewInput(value: unknown): asserts value is ReviewInput {
  if (!hasExactKeys(value, reviewInputKeys)
    || !isUuid(value.completionId)
    || typeof value.attempted !== 'boolean'
    || !isObservation(value.observation)
    || !isHypothesisResult(value.hypothesisResult)
    || !isNextDirection(value.nextDirection)
    || !isUuid(value.idempotencyKey)) {
    throw new Error('invalid_progress_input');
  }
}

function assertSetSavedInput(
  value: unknown,
): asserts value is SetSavedInput {
  if (!hasExactKeys(value, savedInputKeys)
    || !isUuid(value.sceneVersionId)
    || !isInsightKind(value.kind)
    || typeof value.saved !== 'boolean') {
    throw new Error('invalid_progress_input');
  }
}

function readCompletionResult(value: unknown): CompletionResult {
  if (!hasExactKeys(value, ['awarded', 'completionId', 'pointsDelta'])
    || !isUuid(value.completionId)
    || typeof value.awarded !== 'boolean'
    || (value.pointsDelta !== 0 && value.pointsDelta !== 10)
    || value.awarded !== (value.pointsDelta === 10)) {
    throw new Error('invalid_complete_training_response');
  }
  return {
    completionId: value.completionId,
    awarded: value.awarded,
    pointsDelta: value.pointsDelta,
  };
}

function readReviewResult(value: unknown): ReviewResult {
  if (!hasExactKeys(value, ['awarded', 'pointsDelta', 'reviewId'])
    || !isUuid(value.reviewId)
    || typeof value.awarded !== 'boolean'
    || (value.pointsDelta !== 0 && value.pointsDelta !== 5)
    || value.awarded !== (value.pointsDelta === 5)) {
    throw new Error('invalid_complete_training_review_response');
  }
  return {
    reviewId: value.reviewId,
    awarded: value.awarded,
    pointsDelta: value.pointsDelta,
  };
}

type SortableSavedInsight = {
  summary: SavedInsightSummary;
  epochMilliseconds: number;
  fractionalSecond: string;
};

function readSavedInsight(value: unknown): SortableSavedInsight {
  if (!hasExactKeys(
    value,
    ['kind', 'route', 'savedAt', 'sceneVersionId'],
  )
    || !isUuid(value.sceneVersionId)
    || !isInsightKind(value.kind)
    || !isSavedRoute(value.route)
    || typeof value.savedAt !== 'string') {
    throw new Error('invalid_list_saved_insights_response');
  }
  const savedAt = normalizeResponseTimestamp(value.savedAt);
  const timestampMatch = responseTimestampPattern.exec(value.savedAt);
  if (savedAt === null || timestampMatch === null) {
    throw new Error('invalid_list_saved_insights_response');
  }
  return {
    summary: {
      sceneVersionId: value.sceneVersionId,
      kind: value.kind,
      savedAt,
      route: value.route,
    },
    epochMilliseconds: new Date(value.savedAt).getTime(),
    fractionalSecond: timestampMatch[7] ?? '',
  };
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareSavedInsights(
  left: SortableSavedInsight,
  right: SortableSavedInsight,
): number {
  if (left.epochMilliseconds !== right.epochMilliseconds) {
    return left.epochMilliseconds > right.epochMilliseconds ? -1 : 1;
  }
  const precision = Math.max(
    left.fractionalSecond.length,
    right.fractionalSecond.length,
  );
  const fractionOrder = compareText(
    left.fractionalSecond.padEnd(precision, '0'),
    right.fractionalSecond.padEnd(precision, '0'),
  );
  if (fractionOrder !== 0) return -fractionOrder;
  const versionOrder = compareText(
    left.summary.sceneVersionId,
    right.summary.sceneVersionId,
  );
  if (versionOrder !== 0) return versionOrder;
  return compareText(left.summary.kind, right.summary.kind);
}

function readReviewPrompt(value: unknown): ReviewPrompt | null {
  if (value === null) return null;
  if (!hasExactKeys(
    value,
    ['completedAt', 'completionId', 'sceneVersionId'],
  )
    || !isUuid(value.completionId)
    || !isUuid(value.sceneVersionId)) {
    throw new Error('invalid_get_pending_review_response');
  }
  const normalized = normalizeResponseTimestamp(value.completedAt);
  if (normalized === null) {
    throw new Error('invalid_get_pending_review_response');
  }
  return {
    completionId: value.completionId,
    sceneVersionId: value.sceneVersionId,
    completedAt: normalized,
  };
}

function readBadge(value: unknown): MilestoneBadge {
  if (!hasExactKeys(value, ['awardedAt', 'key', 'label'])) {
    throw new Error('invalid_get_private_progress_response');
  }
  const awardedAt = normalizeResponseTimestamp(value.awardedAt);
  if (awardedAt === null) {
    throw new Error('invalid_get_private_progress_response');
  }

  if (value.key === 'first-scene'
    && value.label === badgeLabels['first-scene']) {
    return {
      key: 'first-scene',
      label: badgeLabels['first-scene'],
      awardedAt,
    };
  }
  if (value.key === 'five-scenes'
    && value.label === badgeLabels['five-scenes']) {
    return {
      key: 'five-scenes',
      label: badgeLabels['five-scenes'],
      awardedAt,
    };
  }
  if (value.key === 'ten-reviews'
    && value.label === badgeLabels['ten-reviews']) {
    return {
      key: 'ten-reviews',
      label: badgeLabels['ten-reviews'],
      awardedAt,
    };
  }
  throw new Error('invalid_get_private_progress_response');
}

function badgeOrder(badge: MilestoneBadge): number {
  if (badge.key === 'first-scene') return 0;
  if (badge.key === 'five-scenes') return 1;
  return 2;
}

function readSurprise(value: unknown): UnlockedSurprise {
  if (!hasExactKeys(value, ['key', 'label'])) {
    throw new Error('invalid_get_private_progress_response');
  }
  if (value.key === 'five-scene-observation-card'
    && value.label === '隐藏观察卡') {
    return {
      key: 'five-scene-observation-card',
      label: '隐藏观察卡',
    };
  }
  if (value.key === 'ten-review-family-lens'
    && value.label === '家庭关系多面镜') {
    return {
      key: 'ten-review-family-lens',
      label: '家庭关系多面镜',
    };
  }
  throw new Error('invalid_get_private_progress_response');
}

function surpriseOrder(surprise: UnlockedSurprise): number {
  return surprise.key === 'five-scene-observation-card' ? 0 : 1;
}

function readClassAggregate(value: unknown): ClassAggregate | null {
  if (value === null) return null;
  if (!hasExactKeys(
    value,
    [
      'activeMembers',
      'collectiveGoal',
      'completedScenes',
      'goalReached',
    ],
  )
    || !isNonNegativeInteger(value.completedScenes)
    || !isNonNegativeInteger(value.activeMembers)
    || value.activeMembers < 3
    || !isNonNegativeInteger(value.collectiveGoal)
    || typeof value.goalReached !== 'boolean'
    || value.goalReached
      !== (value.completedScenes >= value.collectiveGoal)) {
    throw new Error('invalid_get_private_progress_response');
  }
  return {
    completedScenes: value.completedScenes,
    activeMembers: value.activeMembers,
    collectiveGoal: value.collectiveGoal,
    goalReached: value.goalReached,
  };
}

function sameOrderedValues(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function readPrivateProgress(value: unknown): PrivateProgress {
  if (!hasExactKeys(value, [
    'badges',
    'classAggregate',
    'completedScenes',
    'points',
    'reviewsCompleted',
    'thisWeekCompletions',
    'unlockedSurprises',
  ])
    || !isNonNegativeInteger(value.points)
    || !isNonNegativeInteger(value.completedScenes)
    || !isNonNegativeInteger(value.reviewsCompleted)
    || !isNonNegativeInteger(value.thisWeekCompletions)
    || !Array.isArray(value.badges)
    || !Array.isArray(value.unlockedSurprises)) {
    throw new Error('invalid_get_private_progress_response');
  }

  const badges = value.badges.map(readBadge)
    .sort((left, right) => badgeOrder(left) - badgeOrder(right));
  const completedScenes = value.completedScenes;
  const reviewsCompleted = value.reviewsCompleted;
  const expectedBadgeKeys = badgeRules
    .filter((rule) => rule.earned(
      completedScenes,
      reviewsCompleted,
    ))
    .map((rule) => rule.key);
  if (!sameOrderedValues(
    badges.map((badge) => badge.key),
    expectedBadgeKeys,
  )) {
    throw new Error('invalid_get_private_progress_response');
  }

  const unlockedSurprises = value.unlockedSurprises.map(readSurprise)
    .sort((left, right) => surpriseOrder(left) - surpriseOrder(right));
  const expectedSurpriseKeys = surpriseRules
    .filter((rule) => rule.earned(
      completedScenes,
      reviewsCompleted,
    ))
    .map((rule) => rule.key);
  if (!sameOrderedValues(
    unlockedSurprises.map((surprise) => surprise.key),
    expectedSurpriseKeys,
  )) {
    throw new Error('invalid_get_private_progress_response');
  }

  return {
    points: value.points,
    completedScenes,
    reviewsCompleted,
    thisWeekCompletions: value.thisWeekCompletions,
    badges,
    unlockedSurprises,
    classAggregate: readClassAggregate(value.classAggregate),
  };
}

export class SupabaseProgressRepository implements ProgressRepository {
  constructor(private readonly client: SupabaseClient) {}

  async complete(command: CompletionCommand): Promise<CompletionResult> {
    assertCompletionCommand(command);
    const { data, error } = await this.client.rpc('complete_training', {
      p_session_id: command.sessionId,
      p_idempotency_key: command.eventId,
    }).single();
    if (error) throw error;
    return readCompletionResult(data);
  }

  async saveReview(input: ReviewInput): Promise<ReviewResult> {
    assertReviewInput(input);
    const { data, error } = await this.client.rpc(
      'complete_training_review',
      {
        p_completion_id: input.completionId,
        p_attempted: input.attempted,
        p_observation: input.observation,
        p_hypothesis_result: input.hypothesisResult,
        p_next_direction: input.nextDirection,
        p_idempotency_key: input.idempotencyKey,
      },
    ).single();
    if (error) throw error;
    return readReviewResult(data);
  }

  async setSaved(input: SetSavedInput): Promise<boolean> {
    assertSetSavedInput(input);
    const { data, error } = await this.client.rpc('set_saved_insight', {
      p_scene_version_id: input.sceneVersionId,
      p_kind: input.kind,
      p_saved: input.saved,
    });
    if (error) throw error;
    if (typeof data !== 'boolean' || data !== input.saved) {
      throw new Error('invalid_set_saved_insight_response');
    }
    return data;
  }

  async listSaved(): Promise<SavedInsightSummary[]> {
    const { data, error } = await this.client.rpc('list_saved_insights');
    if (error) throw error;
    if (!Array.isArray(data)) {
      throw new Error('invalid_list_saved_insights_response');
    }
    return data
      .map(readSavedInsight)
      .sort(compareSavedInsights)
      .map((item) => item.summary);
  }

  async getPendingReview(): Promise<ReviewPrompt | null> {
    const { data, error } = await this.client.rpc('get_pending_review');
    if (error) throw error;
    return readReviewPrompt(data);
  }

  async getPrivateProgress(): Promise<PrivateProgress> {
    const { data, error } = await this.client.rpc('get_private_progress');
    if (error) throw error;
    return readPrivateProgress(data);
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type {
  ReviewInput,
  SetSavedInput,
} from '../../domain/progress/types';
import type { CompletionCommand } from '../../domain/training/types';
import { SupabaseProgressRepository } from './SupabaseProgressRepository';

type RpcResult = { data: unknown; error: unknown };

function fakeClient(result: RpcResult) {
  const single = vi.fn().mockResolvedValue(result);
  const builder = {
    single,
    then: (
      onFulfilled?: (value: RpcResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  const rpc = vi.fn(() => builder);
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
    single,
  };
}

const eventId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const sceneId = '30000000-0000-4000-8000-000000000001';
const sceneVersionId = '40000000-0000-4000-8000-000000000001';
const completionId = '50000000-0000-4000-8000-000000000001';
const reviewId = '60000000-0000-4000-8000-000000000001';
const completedAt = '2026-07-22T12:00:00.000Z';

const command: CompletionCommand = {
  eventId,
  sessionId,
  sceneId,
  sceneVersionId,
  completedAt,
};

const reviewInput: ReviewInput = {
  completionId,
  attempted: true,
  observation: 'helpful',
  hypothesisResult: 'supported',
  nextDirection: 'repeat',
  idempotencyKey: eventId,
};

const savedInput: SetSavedInput = {
  sceneVersionId,
  kind: 'reframe',
  saved: true,
};

function callCompleteWith(repository: SupabaseProgressRepository, value: unknown) {
  return Reflect.apply(repository.complete, repository, [value]);
}

function callReviewWith(repository: SupabaseProgressRepository, value: unknown) {
  return Reflect.apply(repository.saveReview, repository, [value]);
}

function callSetSavedWith(repository: SupabaseProgressRepository, value: unknown) {
  return Reflect.apply(repository.setSaved, repository, [value]);
}

describe('SupabaseProgressRepository completion and review mutations', () => {
  it('sends only server-authoritative completion parameters and maps a new award', async () => {
    const response = { completionId, awarded: true, pointsDelta: 10 };
    const fake = fakeClient({ data: response, error: null });
    const repository = new SupabaseProgressRepository(fake.client);

    const result = await repository.complete(command);

    expect(fake.rpc).toHaveBeenCalledWith('complete_training', {
      p_session_id: sessionId,
      p_idempotency_key: eventId,
    });
    expect(fake.single).toHaveBeenCalledTimes(1);
    expect(result).toEqual(response);
    expect(result).not.toBe(response);
  });

  it.each([
    [{ completionId, awarded: false, pointsDelta: 0 }],
    [{ completionId, awarded: true, pointsDelta: 10 }],
  ])('accepts only consistent completion award results', async (data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).complete(command),
    ).resolves.toEqual(data);
  });

  it.each([
    ['null', null],
    ['array', [{ completionId, awarded: false, pointsDelta: 0 }]],
    ['missing field', { completionId, awarded: false }],
    ['extra field', {
      completionId,
      awarded: false,
      pointsDelta: 0,
      answer: 'private',
    }],
    ['invalid UUID', {
      completionId: 'not-a-uuid',
      awarded: false,
      pointsDelta: 0,
    }],
    ['non-boolean award', {
      completionId,
      awarded: 0,
      pointsDelta: 0,
    }],
    ['unknown points delta', {
      completionId,
      awarded: true,
      pointsDelta: 5,
    }],
    ['inconsistent awarded false', {
      completionId,
      awarded: false,
      pointsDelta: 10,
    }],
    ['inconsistent awarded true', {
      completionId,
      awarded: true,
      pointsDelta: 0,
    }],
  ])('rejects a malformed completion result: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).complete(command),
    ).rejects.toThrow('invalid_complete_training_response');
  });

  it('sends the exact controlled review fields and maps its award', async () => {
    const response = { reviewId, awarded: true, pointsDelta: 5 };
    const fake = fakeClient({ data: response, error: null });
    const repository = new SupabaseProgressRepository(fake.client);

    await expect(repository.saveReview(reviewInput)).resolves.toEqual(response);
    expect(fake.rpc).toHaveBeenCalledWith('complete_training_review', {
      p_completion_id: completionId,
      p_attempted: true,
      p_observation: 'helpful',
      p_hypothesis_result: 'supported',
      p_next_direction: 'repeat',
      p_idempotency_key: eventId,
    });
    expect(fake.single).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ reviewId, awarded: false, pointsDelta: 0 }],
    [{ reviewId, awarded: true, pointsDelta: 5 }],
  ])('accepts only consistent review award results', async (data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).saveReview(reviewInput),
    ).resolves.toEqual(data);
  });

  it.each([
    ['null', null],
    ['array', [{ reviewId, awarded: false, pointsDelta: 0 }]],
    ['missing field', { reviewId, awarded: false }],
    ['extra field', {
      reviewId,
      awarded: false,
      pointsDelta: 0,
      note: 'private',
    }],
    ['invalid UUID', {
      reviewId: '',
      awarded: false,
      pointsDelta: 0,
    }],
    ['unknown delta', {
      reviewId,
      awarded: true,
      pointsDelta: 10,
    }],
    ['inconsistent result', {
      reviewId,
      awarded: false,
      pointsDelta: 5,
    }],
  ])('rejects a malformed review result: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).saveReview(reviewInput),
    ).rejects.toThrow('invalid_complete_training_review_response');
  });

  it.each([
    ['completion missing key', {
      eventId,
      sessionId,
      sceneId,
      sceneVersionId,
    }, 'completion'],
    ['completion extra key', { ...command, answer: 'private' }, 'completion'],
    ['completion invalid event UUID', { ...command, eventId: 'bad' }, 'completion'],
    ['completion invalid session UUID', { ...command, sessionId: '' }, 'completion'],
    ['completion invalid scene UUID', { ...command, sceneId: 'bad' }, 'completion'],
    ['completion invalid version UUID', {
      ...command,
      sceneVersionId: 'bad',
    }, 'completion'],
    ['completion timestamp without milliseconds', {
      ...command,
      completedAt: '2026-07-22T12:00:00Z',
    }, 'completion'],
    ['completion timestamp with offset', {
      ...command,
      completedAt: '2026-07-22T20:00:00.000+08:00',
    }, 'completion'],
    ['completion impossible date', {
      ...command,
      completedAt: '2026-02-29T12:00:00.000Z',
    }, 'completion'],
    ['review missing key', {
      completionId,
      attempted: true,
      observation: 'helpful',
      hypothesisResult: 'supported',
      nextDirection: 'repeat',
    }, 'review'],
    ['review extra key', { ...reviewInput, note: '' }, 'review'],
    ['review invalid completion UUID', {
      ...reviewInput,
      completionId: 'bad',
    }, 'review'],
    ['review non-boolean attempted', {
      ...reviewInput,
      attempted: 1,
    }, 'review'],
    ['review unknown observation', {
      ...reviewInput,
      observation: 'great',
    }, 'review'],
    ['review unknown hypothesis result', {
      ...reviewInput,
      hypothesisResult: 'proven',
    }, 'review'],
    ['review unknown next direction', {
      ...reviewInput,
      nextDirection: 'ignore',
    }, 'review'],
    ['review invalid idempotency UUID', {
      ...reviewInput,
      idempotencyKey: 'bad',
    }, 'review'],
  ])('rejects invalid input with zero network calls: %s', async (
    _case,
    input,
    operation,
  ) => {
    const fake = fakeClient({ data: null, error: null });
    const repository = new SupabaseProgressRepository(fake.client);

    const request = operation === 'completion'
      ? callCompleteWith(repository, input)
      : callReviewWith(repository, input);

    await expect(request).rejects.toThrow('invalid_progress_input');
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.single).not.toHaveBeenCalled();
  });

  it('propagates mutation RPC errors without a local or mock fallback', async () => {
    const completeError = new Error('completion unavailable');
    const reviewError = new Error('review unavailable');
    const completionFake = fakeClient({ data: null, error: completeError });
    const reviewFake = fakeClient({ data: null, error: reviewError });

    await expect(
      new SupabaseProgressRepository(completionFake.client).complete(command),
    ).rejects.toBe(completeError);
    await expect(
      new SupabaseProgressRepository(reviewFake.client).saveReview(reviewInput),
    ).rejects.toBe(reviewError);
  });
});

describe('SupabaseProgressRepository saved insights', () => {
  it.each([
    [true, true],
    [false, false],
  ])('sets the desired state %s and accepts only that exact boolean', async (
    desired,
    response,
  ) => {
    const fake = fakeClient({ data: response, error: null });
    const repository = new SupabaseProgressRepository(fake.client);

    await expect(repository.setSaved({
      ...savedInput,
      saved: desired,
    })).resolves.toBe(response);
    expect(fake.rpc).toHaveBeenCalledWith('set_saved_insight', {
      p_scene_version_id: sceneVersionId,
      p_kind: 'reframe',
      p_saved: desired,
    });
    expect(fake.single).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['numeric false', 0],
    ['object', { saved: true }],
  ])('rejects a non-boolean saved response: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).setSaved(savedInput),
    ).rejects.toThrow('invalid_set_saved_insight_response');
  });

  it.each([
    ['true request returning false', true, false],
    ['false request returning true', false, true],
  ])('rejects a saved-state mismatch: %s', async (
    _case,
    desired,
    response,
  ) => {
    const fake = fakeClient({ data: response, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).setSaved({
        ...savedInput,
        saved: desired,
      }),
    ).rejects.toThrow('invalid_set_saved_insight_response');
  });

  it.each([
    ['missing key', { sceneVersionId, kind: 'reframe' }],
    ['extra key', { ...savedInput, content: 'snapshot' }],
    ['invalid version UUID', { ...savedInput, sceneVersionId: 'bad' }],
    ['unknown kind', { ...savedInput, kind: 'thought' }],
    ['non-boolean desired state', { ...savedInput, saved: 1 }],
  ])('rejects invalid saved input with zero RPC calls: %s', async (_case, input) => {
    const fake = fakeClient({ data: null, error: null });
    const repository = new SupabaseProgressRepository(fake.client);

    await expect(callSetSavedWith(repository, input))
      .rejects.toThrow('invalid_progress_input');
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it('normalizes saved timestamps and orders newest, version, then kind', async () => {
    const otherVersionId = '40000000-0000-4000-8000-000000000002';
    const data = [
      {
        sceneVersionId: otherVersionId,
        kind: 'reframe',
        savedAt: '2026-07-22T20:00:00+08:00',
        route: 'content-update',
      },
      {
        sceneVersionId,
        kind: 'reframe',
        savedAt: '2026-07-22T20:00:00+08:00',
        route: 'available',
      },
      {
        sceneVersionId,
        kind: 'expression',
        savedAt: '2026-07-23T12:00:00.125+00:00',
        route: 'safety-stop',
      },
    ];
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).listSaved(),
    ).resolves.toEqual([
      {
        sceneVersionId,
        kind: 'expression',
        savedAt: '2026-07-23T12:00:00.125Z',
        route: 'safety-stop',
      },
      {
        sceneVersionId,
        kind: 'reframe',
        savedAt: '2026-07-22T12:00:00.000Z',
        route: 'available',
      },
      {
        sceneVersionId: otherVersionId,
        kind: 'reframe',
        savedAt: '2026-07-22T12:00:00.000Z',
        route: 'content-update',
      },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith('list_saved_insights');
    expect(fake.single).not.toHaveBeenCalled();
  });

  it('orders by the original sub-millisecond instant before normalized tie-breakers', async () => {
    const olderVersionId = '40000000-0000-4000-8000-000000000001';
    const newerVersionId = '40000000-0000-4000-8000-000000000002';
    const fake = fakeClient({
      data: [
        {
          sceneVersionId: olderVersionId,
          kind: 'reframe',
          savedAt: '2026-07-22T12:00:00.0001Z',
          route: 'available',
        },
        {
          sceneVersionId: newerVersionId,
          kind: 'reframe',
          savedAt: '2026-07-22T12:00:00.0009Z',
          route: 'available',
        },
      ],
      error: null,
    });

    await expect(
      new SupabaseProgressRepository(fake.client).listSaved(),
    ).resolves.toEqual([
      {
        sceneVersionId: newerVersionId,
        kind: 'reframe',
        savedAt: '2026-07-22T12:00:00.000Z',
        route: 'available',
      },
      {
        sceneVersionId: olderVersionId,
        kind: 'reframe',
        savedAt: '2026-07-22T12:00:00.000Z',
        route: 'available',
      },
    ]);
  });

  it.each([
    ['null list', null],
    ['object list', {}],
    ['null item', [null]],
    ['missing key', [{
      sceneVersionId,
      kind: 'reframe',
      savedAt: completedAt,
    }]],
    ['extra key', [{
      sceneVersionId,
      kind: 'reframe',
      savedAt: completedAt,
      route: 'available',
      content: 'snapshot',
    }]],
    ['invalid UUID', [{
      sceneVersionId: 'bad',
      kind: 'reframe',
      savedAt: completedAt,
      route: 'available',
    }]],
    ['unknown kind', [{
      sceneVersionId,
      kind: 'thought',
      savedAt: completedAt,
      route: 'available',
    }]],
    ['unknown route', [{
      sceneVersionId,
      kind: 'reframe',
      savedAt: completedAt,
      route: 'continue',
    }]],
    ['date only', [{
      sceneVersionId,
      kind: 'reframe',
      savedAt: '2026-07-22',
      route: 'available',
    }]],
    ['timezone free', [{
      sceneVersionId,
      kind: 'reframe',
      savedAt: '2026-07-22T12:00:00',
      route: 'available',
    }]],
    ['impossible date', [{
      sceneVersionId,
      kind: 'reframe',
      savedAt: '2026-02-29T12:00:00+00:00',
      route: 'available',
    }]],
  ])('rejects a malformed saved list: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).listSaved(),
    ).rejects.toThrow('invalid_list_saved_insights_response');
  });
});

describe('SupabaseProgressRepository pending reviews and private progress', () => {
  it('returns null when no owned completion is pending review', async () => {
    const fake = fakeClient({ data: null, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).getPendingReview(),
    ).resolves.toBeNull();
    expect(fake.rpc).toHaveBeenCalledWith('get_pending_review');
    expect(fake.single).not.toHaveBeenCalled();
  });

  it('maps the oldest pending-review summary and normalizes its timestamp', async () => {
    const data = {
      completionId,
      sceneVersionId,
      completedAt: '2026-07-22T20:00:00+08:00',
    };
    const fake = fakeClient({ data, error: null });

    const result = await new SupabaseProgressRepository(fake.client)
      .getPendingReview();

    expect(result).toEqual({
      completionId,
      sceneVersionId,
      completedAt,
    });
    expect(result).not.toBe(data);
  });

  it.each([
    ['array', [{
      completionId,
      sceneVersionId,
      completedAt,
    }]],
    ['missing key', { completionId, sceneVersionId }],
    ['extra key', {
      completionId,
      sceneVersionId,
      completedAt,
      answer: 'private',
    }],
    ['invalid completion UUID', {
      completionId: 'bad',
      sceneVersionId,
      completedAt,
    }],
    ['timezone-free date', {
      completionId,
      sceneVersionId,
      completedAt: '2026-07-22T12:00:00',
    }],
  ])('rejects a malformed pending-review response: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).getPendingReview(),
    ).rejects.toThrow('invalid_get_pending_review_response');
  });

  it('maps, normalizes, and deterministically orders strict private progress', async () => {
    const data = {
      points: 100,
      completedScenes: 5,
      reviewsCompleted: 10,
      thisWeekCompletions: 3,
      badges: [
        {
          key: 'ten-reviews',
          label: '完成十次复盘',
          awardedAt: '2026-07-22T20:00:00+08:00',
        },
        {
          key: 'first-scene',
          label: '第一次转念',
          awardedAt: '2026-07-01T00:00:00+00:00',
        },
        {
          key: 'five-scenes',
          label: '看见五个新可能',
          awardedAt: '2026-07-10T00:00:00Z',
        },
      ],
      unlockedSurprises: [
        {
          key: 'ten-review-family-lens',
          label: '家庭关系多面镜',
        },
        {
          key: 'five-scene-observation-card',
          label: '隐藏观察卡',
        },
      ],
      classAggregate: {
        completedScenes: 12,
        activeMembers: 20,
        collectiveGoal: 50,
        goalReached: false,
      },
    };
    const fake = fakeClient({ data, error: null });

    const result = await new SupabaseProgressRepository(fake.client)
      .getPrivateProgress();

    expect(fake.rpc).toHaveBeenCalledWith('get_private_progress');
    expect(fake.single).not.toHaveBeenCalled();
    expect(result).toEqual({
      ...data,
      badges: [
        {
          key: 'first-scene',
          label: '第一次转念',
          awardedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          key: 'five-scenes',
          label: '看见五个新可能',
          awardedAt: '2026-07-10T00:00:00.000Z',
        },
        {
          key: 'ten-reviews',
          label: '完成十次复盘',
          awardedAt: '2026-07-22T12:00:00.000Z',
        },
      ],
      unlockedSurprises: [
        {
          key: 'five-scene-observation-card',
          label: '隐藏观察卡',
        },
        {
          key: 'ten-review-family-lens',
          label: '家庭关系多面镜',
        },
      ],
    });
    expect(result).not.toBe(data);
    expect(result.badges).not.toBe(data.badges);
    expect(result.unlockedSurprises).not.toBe(data.unlockedSurprises);
    expect(result.classAggregate).not.toBe(data.classAggregate);
  });

  it.each([
    [
      'zero scenes and reviews',
      0,
      0,
      [],
      [],
    ],
    [
      'one scene',
      1,
      0,
      [{
        key: 'first-scene',
        label: '第一次转念',
        awardedAt: completedAt,
      }],
      [],
    ],
    [
      'four scenes and nine reviews',
      4,
      9,
      [{
        key: 'first-scene',
        label: '第一次转念',
        awardedAt: completedAt,
      }],
      [],
    ],
    [
      'five scenes',
      5,
      9,
      [
        {
          key: 'first-scene',
          label: '第一次转念',
          awardedAt: completedAt,
        },
        {
          key: 'five-scenes',
          label: '看见五个新可能',
          awardedAt: completedAt,
        },
      ],
      [{
        key: 'five-scene-observation-card',
        label: '隐藏观察卡',
      }],
    ],
    [
      'ten reviews independently',
      1,
      10,
      [
        {
          key: 'first-scene',
          label: '第一次转念',
          awardedAt: completedAt,
        },
        {
          key: 'ten-reviews',
          label: '完成十次复盘',
          awardedAt: completedAt,
        },
      ],
      [{
        key: 'ten-review-family-lens',
        label: '家庭关系多面镜',
      }],
    ],
  ])('accepts exact deterministic thresholds: %s', async (
    _case,
    completedScenes,
    reviewsCompleted,
    badges,
    unlockedSurprises,
  ) => {
    const fake = fakeClient({
      data: {
        points: 0,
        completedScenes,
        reviewsCompleted,
        thisWeekCompletions: 0,
        badges,
        unlockedSurprises,
        classAggregate: null,
      },
      error: null,
    });

    await expect(
      new SupabaseProgressRepository(fake.client).getPrivateProgress(),
    ).resolves.toMatchObject({
      completedScenes,
      reviewsCompleted,
      badges,
      unlockedSurprises,
      classAggregate: null,
    });
  });

  it.each([
    ['null', null],
    ['array', []],
    ['missing key', {
      points: 0,
      completedScenes: 0,
      reviewsCompleted: 0,
      thisWeekCompletions: 0,
      badges: [],
      unlockedSurprises: [],
    }],
    ['extra key', {
      points: 0,
      completedScenes: 0,
      reviewsCompleted: 0,
      thisWeekCompletions: 0,
      badges: [],
      unlockedSurprises: [],
      classAggregate: null,
      rank: 1,
    }],
    ['negative count', {
      points: -1,
      completedScenes: 0,
      reviewsCompleted: 0,
      thisWeekCompletions: 0,
      badges: [],
      unlockedSurprises: [],
      classAggregate: null,
    }],
    ['fractional count', {
      points: 0,
      completedScenes: 0.5,
      reviewsCompleted: 0,
      thisWeekCompletions: 0,
      badges: [],
      unlockedSurprises: [],
      classAggregate: null,
    }],
    ['badge key-label mismatch', {
      points: 10,
      completedScenes: 1,
      reviewsCompleted: 0,
      thisWeekCompletions: 1,
      badges: [{
        key: 'first-scene',
        label: '思想正确',
        awardedAt: completedAt,
      }],
      unlockedSurprises: [],
      classAggregate: null,
    }],
    ['missing deterministic badge', {
      points: 10,
      completedScenes: 1,
      reviewsCompleted: 0,
      thisWeekCompletions: 1,
      badges: [],
      unlockedSurprises: [],
      classAggregate: null,
    }],
    ['unexpected surprise', {
      points: 10,
      completedScenes: 1,
      reviewsCompleted: 0,
      thisWeekCompletions: 1,
      badges: [{
        key: 'first-scene',
        label: '第一次转念',
        awardedAt: completedAt,
      }],
      unlockedSurprises: [{
        key: 'five-scene-observation-card',
        label: '隐藏观察卡',
      }],
      classAggregate: null,
    }],
    ['unsafe small cohort aggregate', {
      points: 0,
      completedScenes: 0,
      reviewsCompleted: 0,
      thisWeekCompletions: 0,
      badges: [],
      unlockedSurprises: [],
      classAggregate: {
        completedScenes: 0,
        activeMembers: 2,
        collectiveGoal: 50,
        goalReached: false,
      },
    }],
    ['inconsistent goal result', {
      points: 0,
      completedScenes: 0,
      reviewsCompleted: 0,
      thisWeekCompletions: 0,
      badges: [],
      unlockedSurprises: [],
      classAggregate: {
        completedScenes: 50,
        activeMembers: 20,
        collectiveGoal: 50,
        goalReached: false,
      },
    }],
  ])('rejects malformed or unsafe private progress: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseProgressRepository(fake.client).getPrivateProgress(),
    ).rejects.toThrow('invalid_get_private_progress_response');
  });

  it('propagates every scalar progress RPC error without fallback data', async () => {
    const error = new Error('progress unavailable');

    for (const operation of [
      (repository: SupabaseProgressRepository) => repository.setSaved(savedInput),
      (repository: SupabaseProgressRepository) => repository.listSaved(),
      (repository: SupabaseProgressRepository) => repository.getPendingReview(),
      (repository: SupabaseProgressRepository) => repository.getPrivateProgress(),
    ]) {
      const fake = fakeClient({ data: null, error });
      await expect(operation(new SupabaseProgressRepository(fake.client)))
        .rejects.toBe(error);
    }
  });
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseTrainingRuntimeRepository } from './SupabaseTrainingRuntimeRepository';

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

const sceneVersionId = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';
const sessionId = '30000000-0000-4000-8000-000000000001';

describe('SupabaseTrainingRuntimeRepository', () => {
  it('starts through the exact RPC and maps a strict response after single()', async () => {
    const data = { sessionId, route: 'continue' };
    const fake = fakeClient({ data, error: null });
    const repository = new SupabaseTrainingRuntimeRepository(fake.client);

    const result = await repository.startTraining(sceneVersionId, requestId);

    expect(fake.rpc).toHaveBeenCalledWith('start_training', {
      p_scene_version_id: sceneVersionId,
      p_idempotency_key: requestId,
    });
    expect(fake.single).toHaveBeenCalledTimes(1);
    expect(result).toEqual(data);
    expect(result).not.toBe(data);
  });

  it.each(['continue', 'content-update', 'safety-stop'] as const)(
    'accepts the authored start route %s',
    async (route) => {
      const fake = fakeClient({ data: { sessionId, route }, error: null });

      await expect(
        new SupabaseTrainingRuntimeRepository(fake.client)
          .startTraining(sceneVersionId, requestId),
      ).resolves.toEqual({ sessionId, route });
    },
  );

  it.each([
    ['null', null],
    ['array', [{ sessionId, route: 'continue' }]],
    ['missing route', { sessionId }],
    ['extra field', { sessionId, route: 'continue', answer: 'private' }],
    ['unknown route', { sessionId, route: 'retry' }],
    ['invalid session ID', { sessionId: 'not-a-uuid', route: 'continue' }],
  ])('rejects a malformed start response: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseTrainingRuntimeRepository(fake.client)
        .startTraining(sceneVersionId, requestId),
    ).rejects.toThrow('invalid_start_training_response');
  });

  it('checks through the exact RPC and accepts only a scalar route', async () => {
    const fake = fakeClient({ data: 'safety-stop', error: null });
    const repository = new SupabaseTrainingRuntimeRepository(fake.client);

    await expect(repository.checkTrainingSession(sessionId)).resolves.toBe(
      'safety-stop',
    );
    expect(fake.rpc).toHaveBeenCalledWith('check_training_session', {
      p_session_id: sessionId,
    });
    expect(fake.single).not.toHaveBeenCalled();
  });

  it.each(['continue', 'content-update', 'safety-stop'] as const)(
    'accepts the authored check route %s',
    async (route) => {
      const fake = fakeClient({ data: route, error: null });

      await expect(
        new SupabaseTrainingRuntimeRepository(fake.client)
          .checkTrainingSession(sessionId),
      ).resolves.toBe(route);
    },
  );

  it.each([
    ['null', null],
    ['array', ['continue']],
    ['object', { route: 'continue' }],
    ['unknown route', 'retry'],
  ])('rejects a malformed check response: %s', async (_case, data) => {
    const fake = fakeClient({ data, error: null });

    await expect(
      new SupabaseTrainingRuntimeRepository(fake.client)
        .checkTrainingSession(sessionId),
    ).rejects.toThrow('invalid_check_training_session_response');
  });

  it.each([
    ['start scene ID', 'bad', requestId, 'start'],
    ['start request ID', sceneVersionId, '', 'start'],
    ['check session ID', 'not-a-uuid', undefined, 'check'],
  ])('rejects an invalid %s before making an RPC', async (
    _case,
    firstId,
    secondId,
    operation,
  ) => {
    const fake = fakeClient({ data: null, error: null });
    const repository = new SupabaseTrainingRuntimeRepository(fake.client);

    const promise = operation === 'start'
      ? repository.startTraining(firstId, secondId!)
      : repository.checkTrainingSession(firstId);

    await expect(promise).rejects.toThrow('invalid_uuid');
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.single).not.toHaveBeenCalled();
  });

  it('propagates start and check RPC errors without fallback values', async () => {
    const startError = new Error('start failed');
    const checkError = new Error('check failed');
    const startFake = fakeClient({ data: null, error: startError });
    const checkFake = fakeClient({ data: null, error: checkError });

    await expect(
      new SupabaseTrainingRuntimeRepository(startFake.client)
        .startTraining(sceneVersionId, requestId),
    ).rejects.toBe(startError);
    await expect(
      new SupabaseTrainingRuntimeRepository(checkFake.client)
        .checkTrainingSession(sessionId),
    ).rejects.toBe(checkError);
  });
});

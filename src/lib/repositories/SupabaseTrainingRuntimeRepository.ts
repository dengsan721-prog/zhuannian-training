import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TrainingRuntimeRepository,
  TrainingRuntimeRoute,
} from './TrainingRuntimeRepository';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const routes = new Set<TrainingRuntimeRoute>([
  'continue',
  'content-update',
  'safety-stop',
]);

function assertUuid(value: string): void {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new Error('invalid_uuid');
  }
}

function isRoute(value: unknown): value is TrainingRuntimeRoute {
  return typeof value === 'string'
    && routes.has(value as TrainingRuntimeRoute);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readStartResponse(value: unknown): {
  sessionId: string;
  route: TrainingRuntimeRoute;
} {
  if (!isPlainObject(value)
    || Object.keys(value).sort().join(',') !== 'route,sessionId'
    || typeof value.sessionId !== 'string'
    || !uuidPattern.test(value.sessionId)
    || !isRoute(value.route)) {
    throw new Error('invalid_start_training_response');
  }
  return {
    sessionId: value.sessionId,
    route: value.route,
  };
}

export class SupabaseTrainingRuntimeRepository
implements TrainingRuntimeRepository {
  constructor(private readonly client: SupabaseClient) {}

  async startTraining(
    sceneVersionId: string,
    requestId: string,
  ): Promise<{ sessionId: string; route: TrainingRuntimeRoute }> {
    assertUuid(sceneVersionId);
    assertUuid(requestId);

    const { data, error } = await this.client.rpc('start_training', {
      p_scene_version_id: sceneVersionId,
      p_idempotency_key: requestId,
    }).single();
    if (error) throw error;
    return readStartResponse(data);
  }

  async checkTrainingSession(
    sessionId: string,
  ): Promise<TrainingRuntimeRoute> {
    assertUuid(sessionId);

    const { data, error } = await this.client.rpc('check_training_session', {
      p_session_id: sessionId,
    });
    if (error) throw error;
    if (!isRoute(data)) {
      throw new Error('invalid_check_training_session_response');
    }
    return data;
  }
}

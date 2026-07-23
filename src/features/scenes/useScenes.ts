import { useCallback, useEffect, useState } from 'react';
import type { PublishedSceneVersion } from '../../domain/scenes/types';
import type { SceneRepository } from '../../lib/repositories/SceneRepository';
import { SupabaseSceneRepository } from '../../lib/repositories/SupabaseSceneRepository';
import { getSupabaseClient } from '../../lib/supabase/client';

type SceneLoadState =
  | { status: 'loading' }
  | { status: 'success'; scenes: PublishedSceneVersion[] }
  | { status: 'error' };

export function useScenes(repository?: SceneRepository) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SceneLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(() => repository ?? new SupabaseSceneRepository(getSupabaseClient()))
      .then((activeRepository) => activeRepository.listPublished())
      .then((scenes) => {
        if (!cancelled) setState({ status: 'success', scenes });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, repository]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  return { state, retry };
}

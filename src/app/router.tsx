import { useMemo } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AdultGatePage } from '../features/onboarding/AdultGatePage';
import { JoinCohortPage } from '../features/onboarding/JoinCohortPage';
import { PhoneVerifyPage } from '../features/onboarding/PhoneVerifyPage';
import {
  ContentCorrectionPage,
  PrivacyNoticePage,
  ServiceBoundaryPage,
} from '../features/onboarding/ServiceInformationPages';
import { FollowUpPage } from '../features/progress/FollowUpPage';
import { ProgressPage } from '../features/progress/ProgressPage';
import { SceneHomePage } from '../features/scenes/SceneHomePage';
import type { ProgressRepository } from '../lib/repositories/ProgressRepository';
import type { SceneRepository } from '../lib/repositories/SceneRepository';
import { SupabaseProgressRepository } from '../lib/repositories/SupabaseProgressRepository';
import type { TrainingRuntimeRepository } from '../lib/repositories/TrainingRuntimeRepository';
import { getSupabaseClient } from '../lib/supabase/client';
import {
  TrainingSafetyRoute,
  TrainingSessionRoute,
  TrainingStartRoute,
} from '../features/training/TrainingRoutes';
import { App } from './App';

const routes = [
  '/support',
  '/account',
  '/coach/*',
  '/supervisor/*',
  '/admin/*',
];

type AppRouterProps = {
  sceneRepository?: SceneRepository;
  runtimeRepository?: TrainingRuntimeRepository;
  progressRepository?: ProgressRepository;
  getCurrentUserId?: () => Promise<string>;
  trainingNow?: () => Date;
  trainingOnline?: boolean;
};

function useResolvedProgressRepository(
  repository?: ProgressRepository,
): ProgressRepository {
  return useMemo(
    () => repository ?? new SupabaseProgressRepository(getSupabaseClient()),
    [repository],
  );
}

function SceneHomeRoute({
  sceneRepository,
  progressRepository,
}: Pick<AppRouterProps, 'sceneRepository' | 'progressRepository'>) {
  const progress = useResolvedProgressRepository(progressRepository);
  return (
    <SceneHomePage
      sceneRepository={sceneRepository}
      progressRepository={progress}
    />
  );
}

function FollowUpRoute({
  progressRepository,
}: Pick<AppRouterProps, 'progressRepository'>) {
  const progress = useResolvedProgressRepository(progressRepository);
  return <FollowUpPage repository={progress} />;
}

function PrivateProgressRoute({
  progressRepository,
}: Pick<AppRouterProps, 'progressRepository'>) {
  const progress = useResolvedProgressRepository(progressRepository);
  return <ProgressPage repository={progress} />;
}

export function AppRouter({
  sceneRepository,
  runtimeRepository,
  progressRepository,
  getCurrentUserId,
  trainingNow,
  trainingOnline,
}: AppRouterProps = {}) {
  const trainingDependencies = {
    sceneRepository,
    runtimeRepository,
    progressRepository,
    getCurrentUserId,
    now: trainingNow,
    online: trainingOnline,
  };
  return (
    <Routes>
      <Route path="/" element={<AdultGatePage />} />
      <Route path="/join" element={<JoinCohortPage />} />
      <Route path="/verify" element={<PhoneVerifyPage />} />
      <Route path="/privacy" element={<PrivacyNoticePage />} />
      <Route path="/service-boundary" element={<ServiceBoundaryPage />} />
      <Route path="/content-correction" element={<ContentCorrectionPage />} />
      <Route
        path="/scenes"
        element={(
          <SceneHomeRoute
            sceneRepository={sceneRepository}
            progressRepository={progressRepository}
          />
        )}
      />
      <Route
        path="/reviews/:completionId"
        element={<FollowUpRoute progressRepository={progressRepository} />}
      />
      <Route
        path="/progress"
        element={<PrivateProgressRoute progressRepository={progressRepository} />}
      />
      <Route
        path="/favorites"
        element={<PrivateProgressRoute progressRepository={progressRepository} />}
      />
      <Route
        path="/train/:sceneSlug"
        element={<TrainingStartRoute {...trainingDependencies} />}
      />
      <Route
        path="/training/:sessionId/safety-stop"
        element={<TrainingSafetyRoute {...trainingDependencies} />}
      />
      <Route
        path="/training/:sessionId/:step"
        element={<TrainingSessionRoute {...trainingDependencies} />}
      />
      {routes.map((path) => <Route key={path} path={path} element={<App />} />)}
    </Routes>
  );
}

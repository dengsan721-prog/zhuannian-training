import { Route, Routes } from 'react-router-dom';
import { AdultGatePage } from '../features/onboarding/AdultGatePage';
import { JoinCohortPage } from '../features/onboarding/JoinCohortPage';
import { PhoneVerifyPage } from '../features/onboarding/PhoneVerifyPage';
import {
  ContentCorrectionPage,
  PrivacyNoticePage,
  ServiceBoundaryPage,
} from '../features/onboarding/ServiceInformationPages';
import { SceneHomePage } from '../features/scenes/SceneHomePage';
import type { SceneRepository } from '../lib/repositories/SceneRepository';
import type { TrainingRuntimeRepository } from '../lib/repositories/TrainingRuntimeRepository';
import {
  TrainingSafetyRoute,
  TrainingSessionRoute,
  TrainingStartRoute,
} from '../features/training/TrainingRoutes';
import { App } from './App';

const routes = [
  '/reviews/:completionId',
  '/progress',
  '/favorites',
  '/support',
  '/account',
  '/coach/*',
  '/supervisor/*',
  '/admin/*',
];

type AppRouterProps = {
  sceneRepository?: SceneRepository;
  runtimeRepository?: TrainingRuntimeRepository;
  getCurrentUserId?: () => Promise<string>;
  trainingNow?: () => Date;
  trainingOnline?: boolean;
};

export function AppRouter({
  sceneRepository,
  runtimeRepository,
  getCurrentUserId,
  trainingNow,
  trainingOnline,
}: AppRouterProps = {}) {
  const trainingDependencies = {
    sceneRepository,
    runtimeRepository,
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
      <Route path="/scenes" element={<SceneHomePage sceneRepository={sceneRepository} />} />
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

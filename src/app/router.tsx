import { Route, Routes } from 'react-router-dom';
import { AdultGatePage } from '../features/onboarding/AdultGatePage';
import { JoinCohortPage } from '../features/onboarding/JoinCohortPage';
import { PhoneVerifyPage } from '../features/onboarding/PhoneVerifyPage';
import { App } from './App';

const routes = [
  '/scenes',
  '/train/:sceneSlug',
  '/training/:sessionId/:step',
  '/reviews/:completionId',
  '/progress',
  '/favorites',
  '/support',
  '/account',
  '/coach/*',
  '/supervisor/*',
  '/admin/*',
];

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<AdultGatePage />} />
      <Route path="/join" element={<JoinCohortPage />} />
      <Route path="/verify" element={<PhoneVerifyPage />} />
      {routes.map((path) => <Route key={path} path={path} element={<App />} />)}
    </Routes>
  );
}

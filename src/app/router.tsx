import { Route, Routes } from 'react-router-dom';
import { AdultGatePage } from '../features/onboarding/AdultGatePage';
import { JoinCohortPage } from '../features/onboarding/JoinCohortPage';
import { PhoneVerifyPage } from '../features/onboarding/PhoneVerifyPage';
import {
  ContentCorrectionPage,
  PrivacyNoticePage,
  ServiceBoundaryPage,
} from '../features/onboarding/ServiceInformationPages';
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
      <Route path="/privacy" element={<PrivacyNoticePage />} />
      <Route path="/service-boundary" element={<ServiceBoundaryPage />} />
      <Route path="/content-correction" element={<ContentCorrectionPage />} />
      {routes.map((path) => <Route key={path} path={path} element={<App />} />)}
    </Routes>
  );
}

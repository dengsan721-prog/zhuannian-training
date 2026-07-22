import { Route, Routes } from 'react-router-dom';
import { App } from './App';

const routes = [
  '/',
  '/join',
  '/verify',
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
      {routes.map((path) => <Route key={path} path={path} element={<App />} />)}
    </Routes>
  );
}

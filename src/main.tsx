import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { redirectDirectPathToHashRoute } from './app/githubPagesRouting';
import { AppRouter } from './app/router';
import './styles/tokens.css';
import './styles/global.css';

redirectDirectPathToHashRoute();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppRouter />
    </HashRouter>
  </StrictMode>,
);

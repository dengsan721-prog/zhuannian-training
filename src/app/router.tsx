import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { DEMO_MODE_KEY, demoEnvironment } from '../demo/demoEnvironment';
import { ReframeExperiencePage } from '../features/experience/ReframeExperiencePage';
import { AdultGatePage } from '../features/onboarding/AdultGatePage';
import { CommentingPage } from '../features/commenting/CommentingPage';
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
import { RequestHelpPage } from '../features/support/RequestHelpPage';
import { SafetyReportPage } from '../features/support/SafetyReportPage';
import { SupportHubPage } from '../features/support/SupportHubPage';
import { SupportStatusPage } from '../features/support/SupportStatusPage';
import { currentTrainingSupportIntent } from '../features/support/currentTrainingSupportIntent';
import {
  loadSafetyContext,
  removeAllSafetyState,
  removeSafetyStateForOtherUsers,
} from '../features/training/trainingDraftStore';
import type { ProgressRepository } from '../lib/repositories/ProgressRepository';
import type { SceneRepository } from '../lib/repositories/SceneRepository';
import type { SupportRepository } from '../lib/repositories/SupportRepository';
import { SupabaseProgressRepository } from '../lib/repositories/SupabaseProgressRepository';
import { SupabaseSupportRepository } from '../lib/repositories/SupabaseSupportRepository';
import type { TrainingRuntimeRepository } from '../lib/repositories/TrainingRuntimeRepository';
import { getSupabaseClient } from '../lib/supabase/client';
import {
  TrainingSafetyRoute,
  TrainingSessionRoute,
  TrainingStartRoute,
} from '../features/training/TrainingRoutes';
import { App } from './App';

const routes = [
  '/account',
  '/coach/*',
  '/supervisor/*',
  '/admin/*',
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let pendingSupportIntentCleanup: ReturnType<typeof setTimeout> | null = null;

type AppRouterProps = {
  sceneRepository?: SceneRepository;
  runtimeRepository?: TrainingRuntimeRepository;
  progressRepository?: ProgressRepository;
  supportRepository?: SupportRepository;
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

function useResolvedSupportRepository(
  repository?: SupportRepository,
):
  | { status: 'ready'; repository: SupportRepository }
  | { status: 'error' } {
  return useMemo(
    () => {
      try {
        return {
          status: 'ready' as const,
          repository: repository
            ?? new SupabaseSupportRepository(getSupabaseClient()),
        };
      } catch {
        return { status: 'error' as const };
      }
    },
    [repository],
  );
}

async function defaultSupportCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  const userId = data.user?.id;
  if (error) {
    throw new Error('current_user_unavailable');
  }
  if (!data.user) {
    removeAllSafetyState();
    currentTrainingSupportIntent.clearAll();
    throw new Error('current_user_unavailable');
  }
  if (!userId || !uuidPattern.test(userId)) {
    throw new Error('current_user_unavailable');
  }
  return userId;
}

function SupportRouteMessage({
  heading,
  children,
  alert = false,
}: {
  heading: string;
  children: ReactNode;
  alert?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <main className="app-shell">
      <section
        className="surface support-shell"
        role={alert ? 'alert' : undefined}
      >
        <h1 ref={headingRef} tabIndex={-1}>{heading}</h1>
        {children}
      </section>
    </main>
  );
}

function SupportIdentityGate({
  getCurrentUserId = defaultSupportCurrentUserId,
  children,
  onIdentityError = currentTrainingSupportIntent.clearAll,
}: {
  getCurrentUserId?: () => Promise<string>;
  children: (ownerUserId: string) => ReactNode;
  onIdentityError?: () => void;
}) {
  const [state, setState] = useState<
    | {
        status: 'loading';
        identityProvider: () => Promise<string>;
      }
    | {
        status: 'ready';
        identityProvider: () => Promise<string>;
        ownerUserId: string;
      }
    | {
        status: 'error';
        identityProvider: () => Promise<string>;
      }
  >({
    status: 'loading',
    identityProvider: getCurrentUserId,
  });
  const visibleState = state.identityProvider === getCurrentUserId
    ? state
    : {
        status: 'loading' as const,
        identityProvider: getCurrentUserId,
      };

  useEffect(() => {
    let active = true;
    let verificationGeneration = 0;
    let verifiedOwnerUserId: string | null = null;
    let unsubscribeAuth: (() => void) | undefined;
    const verifyIdentity = () => {
      const generation = ++verificationGeneration;
      void getCurrentUserId()
        .then((ownerUserId) => {
          if (!uuidPattern.test(ownerUserId)) {
            throw new Error('invalid_current_user');
          }
          if (active && generation === verificationGeneration) {
            removeSafetyStateForOtherUsers(ownerUserId);
            verifiedOwnerUserId = ownerUserId;
            setState({
              status: 'ready',
              identityProvider: getCurrentUserId,
              ownerUserId,
            });
          }
        })
        .catch(() => {
          if (active && generation === verificationGeneration) {
            verifiedOwnerUserId = null;
            onIdentityError?.();
            setState({
              status: 'error',
              identityProvider: getCurrentUserId,
            });
          }
        });
    };

    verifyIdentity();
    if (getCurrentUserId === defaultSupportCurrentUserId) {
      try {
        const { data } = getSupabaseClient().auth.onAuthStateChange((
          event,
          session,
        ) => {
          if (!active || event === 'INITIAL_SESSION') return;
          if (event === 'SIGNED_OUT') {
            verificationGeneration += 1;
            verifiedOwnerUserId = null;
            removeAllSafetyState();
            currentTrainingSupportIntent.clearAll();
            setState({
              status: 'error',
              identityProvider: getCurrentUserId,
            });
            return;
          }
          if (event !== 'SIGNED_IN'
            || session?.user.id === verifiedOwnerUserId) {
            return;
          }
          verifiedOwnerUserId = null;
          setState({
            status: 'loading',
            identityProvider: getCurrentUserId,
          });
          verifyIdentity();
        });
        unsubscribeAuth = () => data.subscription.unsubscribe();
      } catch {
        // The initial server verification owns the visible error state.
      }
    }

    return () => {
      active = false;
      verificationGeneration += 1;
      unsubscribeAuth?.();
    };
  }, [getCurrentUserId, onIdentityError]);

  if (visibleState.status === 'loading') {
    return (
      <SupportRouteMessage heading="正在核对账户">
        <p role="status">请稍候……</p>
      </SupportRouteMessage>
    );
  }
  if (visibleState.status === 'error') {
    return (
      <SupportRouteMessage heading="无法核对账户" alert>
        <p>当前不能安全地打开提交页面，请重新登录后再试。</p>
      </SupportRouteMessage>
    );
  }
  return children(visibleState.ownerUserId);
}

function SupportRequestRoute({
  supportRepository,
  getCurrentUserId,
  trainingOnline,
}: Pick<
  AppRouterProps,
  'supportRepository' | 'getCurrentUserId' | 'trainingOnline'
>) {
  const resolved = useResolvedSupportRepository(supportRepository);

  useEffect(() => {
    if (pendingSupportIntentCleanup !== null) {
      clearTimeout(pendingSupportIntentCleanup);
      pendingSupportIntentCleanup = null;
    }
    return () => {
      pendingSupportIntentCleanup = setTimeout(() => {
        currentTrainingSupportIntent.clearAll();
        pendingSupportIntentCleanup = null;
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (resolved.status === 'error') {
      currentTrainingSupportIntent.clearAll();
    }
  }, [resolved.status]);

  if (resolved.status === 'error') {
    return (
      <SupportRouteMessage heading="无法打开支持服务" alert>
        <p>当前服务配置不可用，本次尚未提交。请稍后再试。</p>
      </SupportRouteMessage>
    );
  }

  return (
    <SupportIdentityGate
      getCurrentUserId={getCurrentUserId}
      onIdentityError={currentTrainingSupportIntent.clearAll}
    >
      {(ownerUserId) => (
        <RequestHelpPage
          key={ownerUserId}
          repository={resolved.repository}
          ownerUserId={ownerUserId}
          online={trainingOnline}
        />
      )}
    </SupportIdentityGate>
  );
}

function SupportStatusRoute({
  supportRepository,
  getCurrentUserId,
  trainingOnline,
}: Pick<
  AppRouterProps,
  'supportRepository' | 'getCurrentUserId' | 'trainingOnline'
>) {
  const resolved = useResolvedSupportRepository(supportRepository);
  if (resolved.status === 'error') {
    return (
      <SupportRouteMessage heading="无法打开提交状态" alert>
        <p>当前服务配置不可用，无法确认最新状态。</p>
      </SupportRouteMessage>
    );
  }
  return (
    <SupportIdentityGate getCurrentUserId={getCurrentUserId}>
      {(ownerUserId) => (
        <SupportStatusPage
          key={ownerUserId}
          repository={resolved.repository}
          online={trainingOnline}
        />
      )}
    </SupportIdentityGate>
  );
}

function SafetyReportRoute({
  supportRepository,
  getCurrentUserId,
  trainingOnline,
}: Pick<
  AppRouterProps,
  'supportRepository' | 'getCurrentUserId' | 'trainingOnline'
>) {
  const resolved = useResolvedSupportRepository(supportRepository);
  const { sessionId } = useParams();
  if (resolved.status === 'error') {
    return (
      <SupportRouteMessage heading="无法打开安全报告" alert>
        <p>
          当前服务配置不可用，尚未创建报告。
          如果危险正在发生，请优先联系当地紧急服务或可信任的人。
        </p>
      </SupportRouteMessage>
    );
  }
  return (
    <SupportIdentityGate getCurrentUserId={getCurrentUserId}>
      {(ownerUserId) => (
        <SafetyReportPage
          key={`${ownerUserId}:${sessionId ?? 'generic'}`}
          repository={resolved.repository}
          ownerUserId={ownerUserId}
          sessionId={sessionId}
          context={sessionId
            ? loadSafetyContext(ownerUserId, sessionId) ?? undefined
            : undefined}
          online={trainingOnline}
        />
      )}
    </SupportIdentityGate>
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
  supportRepository,
  getCurrentUserId,
  trainingNow,
  trainingOnline,
}: AppRouterProps = {}) {
  const demoMode = window.sessionStorage.getItem(DEMO_MODE_KEY) === '1';
  const activeSceneRepository = sceneRepository
    ?? (demoMode ? demoEnvironment.sceneRepository : undefined);
  const activeRuntimeRepository = runtimeRepository
    ?? (demoMode ? demoEnvironment.runtimeRepository : undefined);
  const activeProgressRepository = progressRepository
    ?? (demoMode ? demoEnvironment.progressRepository : undefined);
  const activeSupportRepository = supportRepository
    ?? (demoMode ? demoEnvironment.supportRepository : undefined);
  const activeCurrentUserId = getCurrentUserId
    ?? (demoMode ? demoEnvironment.getCurrentUserId : undefined);
  const activeOnline = trainingOnline ?? (demoMode ? true : undefined);
  const trainingDependencies = {
    sceneRepository: activeSceneRepository,
    runtimeRepository: activeRuntimeRepository,
    progressRepository: activeProgressRepository,
    supportRepository: activeSupportRepository,
    getCurrentUserId: activeCurrentUserId,
    now: trainingNow,
    online: activeOnline,
  };
  return (
    <Routes>
      <Route path="/" element={<AdultGatePage />} />
      <Route path="/join" element={<JoinCohortPage />} />
      <Route path="/verify" element={<PhoneVerifyPage />} />
      <Route path="/privacy" element={<PrivacyNoticePage />} />
      <Route path="/service-boundary" element={<ServiceBoundaryPage />} />
      <Route path="/content-correction" element={<ContentCorrectionPage />} />
      <Route path="/commenting" element={<CommentingPage />} />
      <Route
        path="/scenes"
        element={demoMode
          ? <ReframeExperiencePage />
          : (
            <SceneHomeRoute
              sceneRepository={activeSceneRepository}
              progressRepository={activeProgressRepository}
            />
          )}
      />
      <Route
        path="/reviews/:completionId"
        element={<FollowUpRoute progressRepository={activeProgressRepository} />}
      />
      <Route
        path="/progress"
        element={<PrivateProgressRoute progressRepository={activeProgressRepository} />}
      />
      <Route
        path="/favorites"
        element={<PrivateProgressRoute progressRepository={activeProgressRepository} />}
      />
      <Route path="/support" element={<SupportHubPage />} />
      <Route
        path="/support/request"
        element={(
          <SupportRequestRoute
            supportRepository={activeSupportRepository}
            getCurrentUserId={activeCurrentUserId}
            trainingOnline={activeOnline}
          />
        )}
      />
      <Route
        path="/support/status"
        element={(
          <SupportStatusRoute
            supportRepository={activeSupportRepository}
            getCurrentUserId={activeCurrentUserId}
            trainingOnline={activeOnline}
          />
        )}
      />
      <Route
        path="/support/safety-report"
        element={(
          <SafetyReportRoute
            supportRepository={activeSupportRepository}
            getCurrentUserId={activeCurrentUserId}
            trainingOnline={activeOnline}
          />
        )}
      />
      <Route
        path="/support/safety-report/:sessionId"
        element={(
          <SafetyReportRoute
            supportRepository={activeSupportRepository}
            getCurrentUserId={activeCurrentUserId}
            trainingOnline={activeOnline}
          />
        )}
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

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { Profile } from './pages/profile/Profile';
import { List } from './pages/organizations/List';
import { Board } from './pages/organizations/Board';
import { Details as OrganizationDetails } from './pages/organizations/Details';
import { OrganizationsAskLayout } from './pages/organizations/ask/OrganizationsAskLayout';
import { AccountsAskLayout } from './pages/accounts/ask/AccountsAskLayout';
import { AccountDetails } from './pages/accounts/Details';
import { List as AccountsList } from './pages/accounts/List';
import { List as PipelinesList } from './pages/pipelines/List';
import { PipelinesAskLayout } from './pages/pipelines/ask/PipelinesAskLayout';
import { Board as AccountsBoard } from './pages/accounts/Board';
import { CopilotIndex } from './pages/copilot/Index';
import CommunicationsPage from './pages/communications/CommunicationsPage';
import { LifecyclePage } from './pages/lifecycle/LifecyclePage';
import { CreateScenario } from './pages/scenarios/CreateScenario';
import { ScenariosHome } from './pages/scenarios/ScenariosHome';
import { EditRuleRoute, NewRuleRoute, RuleSegmentRoute } from './pages/rules/RuleBuilder';
import { RulePage } from './pages/rules/RulePage';
import { ContactsPage } from './pages/contacts/ContactsPage';
import { ContactsAskLayout } from './pages/contacts/ask/ContactsAskLayout';
import { ContactsListRedirect } from './pages/contacts/ContactsListRedirect';
import { CustomObjectRecordsPage } from './pages/customObjects/CustomObjectRecordsPage';
import { Board as PipelinesBoard } from './pages/pipelines/Board';
import { HostedForm } from './pages/surveys/HostedForm';
import { SendPage } from './pages/surveys/SendPage';
import { EditSurveyRoute, NewSurveyRoute, SurveySegmentRoute } from './pages/surveys/SurveyBuilder';
import { SurveysHome } from './pages/surveys/SurveysHome';
import { CanvasPage } from './pages/canvas/CanvasPage';
import { MapEditor } from './pages/canvas/MapEditor';
import { CampaignsHome } from './pages/campaigns/CampaignsHome';
import { EditCampaignRoute, NewCampaignRoute } from './pages/campaigns/CampaignBuilder';
import { CampaignPage } from './pages/campaigns/CampaignPage';
import { Unsubscribe } from './pages/campaigns/Unsubscribe';
import { EditSegmentRoute, NewSegmentRoute } from './pages/segments/Builder';
import { SegmentPage } from './pages/segments/SegmentPage';
import { SegmentsList } from './pages/segments/SegmentsList';
import { useAppSelector } from './hooks';
import { RootRedirect } from './components/auth/RootRedirect';
import { themeIsDark } from './lib/theme';
import { dashboardRoutes } from './pages/dashboard/routes';
import { settingsRoutes } from './pages/settings/routes';
// Company Brain pages (rules spec §2.4: /brain/review is open to everyone)
import { BrainRoutes } from './pages/brain/BrainRoutes';
import { WorkRoutes } from './pages/work/WorkRoutes';
import { OnboardingCarousel } from './pages/onboarding/OnboardingCarousel';
import { AuthCallback } from './pages/auth/AuthCallback';
import { RequirePlatform } from './components/auth/RequirePlatform';
import { PlatformLayout } from './layouts/PlatformLayout';
import { PlatformOverview } from './pages/platform/PlatformOverview';
import { PlatformOrganisations } from './pages/platform/PlatformOrganisations';
import { PlatformOrganisationDetail } from './pages/platform/PlatformOrganisationDetail';
import { PlatformStaff } from './pages/platform/PlatformStaff';
import { PlatformAccount } from './pages/platform/PlatformAccount';
import { NewPlanRoute, RecordPlanRoute } from './pages/plans/NewPlan';
import { PlanPage } from './pages/plans/PlanPage';
import { ProjectsHome } from './pages/plans/ProjectsHome';
import { EditTemplateRoute, NewTemplateRoute } from './pages/plans/TemplateEditor';
import { TemplatesPage } from './pages/plans/TemplatesPage';

// The primitives gallery (UI foundations spec §1): development builds only,
// so the import and the route both drop out of production.
const UiGallery = import.meta.env.DEV ? lazy(() => import('./pages/dev/UiGallery').then((module) => ({ default: module.UiGallery }))) : null;

function ThemeSynchronizer() {
  const theme = useAppSelector((state) => state.settings.theme);
  // The hosted survey form (/s/:token) and the unsubscribe page (/u/:token) are light only.
  const { pathname } = useLocation();

  useEffect(() => {
    const updateTheme = () => {
      const isDark = themeIsDark(theme, window.matchMedia('(prefers-color-scheme: dark)').matches, pathname);

      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    };

    updateTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => updateTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme, pathname]);

  return null;
}

// The tenant shell is not for staff. Anything under it sends a superuser to
// the portal, so there is no way to wander into an empty tenant view.
function TenantOnly({ children }: { children: React.ReactNode }) {
  const isStaff = useAppSelector((state) => state.auth.user?.is_superuser === true);
  if (isStaff) return <Navigate to="/platform" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <ThemeSynchronizer />
      <Routes>
        {/* Public routes — nobody is signed in yet on any of these. */}
        <Route path="/login" element={<Login />} />
        {/* Where revenact-backend's OAuth callback redirects the browser. */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* The one-time survey link a customer opens from their email
            (surveys spec §2.4): no shell, no session, light only. */}
        <Route path="/s/:token" element={<HostedForm />} />
        {/* The one-click unsubscribe a customer opens from a campaign email
            (campaigns spec §2.4): no shell, no session, light only. */}
        <Route path="/u/:token" element={<Unsubscribe />} />

        {UiGallery ? (
          <Route
            path="/__ui"
            element={
              <Suspense fallback={null}>
                <UiGallery />
              </Suspense>
            }
          />
        ) : null}

        {/* The product tour shows real surfaces, so it is behind the session
            like everything else rather than public. */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <TenantOnly>
                <OnboardingCarousel />
              </TenantOnly>
            </ProtectedRoute>
          }
        />

        {/* The internal portal: Revenact staff, second factor required. Its
            own shell, never the tenant one. */}
        <Route
          path="/platform"
          element={
            <ProtectedRoute>
              <RequirePlatform>
                <PlatformLayout />
              </RequirePlatform>
            </ProtectedRoute>
          }
        >
          <Route index element={<PlatformOverview />} />
          <Route path="organisations" element={<PlatformOrganisations />} />
          <Route path="organisations/:id" element={<PlatformOrganisationDetail />} />
          <Route path="staff" element={<PlatformStaff />} />
        </Route>
        {/* Where the second factor is set up, so it cannot require one. */}
        <Route
          path="/platform/account"
          element={
            <ProtectedRoute>
              <RequirePlatform requireMfa={false}>
                <PlatformLayout />
              </RequirePlatform>
            </ProtectedRoute>
          }
        >
          <Route index element={<PlatformAccount />} />
        </Route>

        {/* Protected routes (tenant shell) */}
        <Route path="/" element={
          <ProtectedRoute>
            <TenantOnly>
              <DashboardLayout />
            </TenantOnly>
          </ProtectedRoute>
        }>
          <Route index element={<RootRedirect />} />
          
          {dashboardRoutes()}

          <Route path="organizations">
            <Route index element={<Navigate to="list" replace />} />
            {/* One Ask conversation above both views and every
                organization's page (spec §3). */}
            <Route element={<OrganizationsAskLayout />}>
              <Route path="list" element={<List />} />
              <Route path="board" element={<Board />} />
              <Route path=":id" element={<OrganizationDetails />}>
                {/* Start a plan over the organisation (plans spec §2.2). */}
                <Route path="plans/new" element={<RecordPlanRoute kind="organization" />} />
              </Route>
            </Route>
          </Route>

          <Route path="accounts">
            <Route index element={<Navigate to="list" replace />} />
            {/* One Ask conversation above both views and every account's
                page (accounts spec 2026-09-29 §3). */}
            <Route element={<AccountsAskLayout />}>
              <Route path="list" element={<AccountsList />} />
              <Route path="board" element={<AccountsBoard />} />
              <Route path=":id" element={<AccountDetails />}>
                {/* Start a plan over the account (plans spec §2.2). */}
                <Route path="plans/new" element={<RecordPlanRoute kind="account" />} />
              </Route>
            </Route>
          </Route>

          <Route path="communications" element={<CommunicationsPage />} />

          <Route path="copilot" element={<CopilotIndex />} />

          <Route path="lifecycle" element={<LifecyclePage />} />

          {/* Scenarios v2 (rules spec 2026-10-04 §2): Rules and the Canvas as
              tabs, the rule builder modal over the list, a rule's page with
              its edit modal. The canvas builder's routes are unchanged. */}
          <Route path="scenarios">
            <Route element={<ScenariosHome />}>
              <Route index element={null} />
              <Route path="rules/new" element={<NewRuleRoute />} />
            </Route>
            <Route path="rules/:id" element={<RulePage />}>
              <Route path="edit" element={<EditRuleRoute />} />
            </Route>
            <Route path="create" element={<CreateScenario />} />
            <Route path=":id" element={<CreateScenario />} />
          </Route>

          {/* Plans (spec 2026-10-04-plans-design §2): the list and board with
              the New plan modal over them, the templates with their editor
              modal, and a plan's page. The sidebar's Project Management link
              lands here. */}
          <Route path="projects">
            <Route element={<ProjectsHome />}>
              <Route index element={null} />
              <Route path="new" element={<NewPlanRoute />} />
            </Route>
            <Route path="templates" element={<TemplatesPage />}>
              <Route path="new" element={<NewTemplateRoute />} />
              <Route path=":templateId/edit" element={<EditTemplateRoute />} />
            </Route>
            <Route path=":id" element={<PlanPage />} />
          </Route>

          {/* Segments (spec 2026-10-03 §3): the list, a segment, its builder
              and a new one. Replaces the Under Construction catch-all here. */}
          <Route path="segments">
            {/* The builder is a modal over the page under it (owner, 2026-10-03). */}
            <Route element={<SegmentsList />}>
              <Route index element={null} />
              <Route path="new" element={<NewSegmentRoute />} />
            </Route>
            <Route path=":id" element={<SegmentPage />}>
              <Route path="edit" element={<EditSegmentRoute />} />
              {/* Survey these (surveys spec §2.5): the survey modal over the segment. */}
              <Route path="survey" element={<SurveySegmentRoute />} />
              {/* Automate (rules spec §2.5): the rule builder over the segment. */}
              <Route path="rule" element={<RuleSegmentRoute />} />
            </Route>
          </Route>

          {/* Surveys (spec 2026-10-03 §2): Sends and Logged scores, the New
              survey modal over the list, a send's page with its edit modal. */}
          <Route path="surveys">
            <Route element={<SurveysHome />}>
              <Route index element={null} />
              <Route path="new" element={<NewSurveyRoute />} />
            </Route>
            <Route path=":id" element={<SendPage />}>
              <Route path="edit" element={<EditSurveyRoute />} />
            </Route>
          </Route>

          <Route path="canvas">
            <Route index element={<CanvasPage />} />
            <Route path="create" element={<Navigate to="/canvas" replace />} />
            <Route path=":id" element={<MapEditor />} />
          </Route>

          {/* Campaigns (spec 2026-10-04 §2): Mine and Shared with me, the
              editor modal over the list, a campaign's page with its editor. */}
          <Route path="campaigns">
            <Route element={<CampaignsHome />}>
              <Route index element={null} />
              <Route path="new" element={<NewCampaignRoute />} />
            </Route>
            <Route path="create" element={<Navigate to="/campaigns/new" replace />} />
            <Route path=":id" element={<CampaignPage />}>
              <Route path="edit" element={<EditCampaignRoute />} />
            </Route>
          </Route>

          {settingsRoutes()}

          {/* /account-settings/* now redirects into Settings (pages/settings/routes.tsx). */}
          

          <Route path="profile" element={<Profile />} />
          
          {/* One page: /contacts lists, /contacts/:id also opens a person
              (spec 2026-09-28 §3). The old /contacts/list still lands,
              its query string kept. */}
          <Route path="contacts/list" element={<ContactsListRedirect />} />
          {/* One Ask conversation above the list and every person (spec 2026-09-28 §4). */}
          <Route element={<ContactsAskLayout />}>
            <Route path="contacts/:id?" element={<ContactsPage />} />
          </Route>

          <Route path="custom-objects/:id" element={<CustomObjectRecordsPage />} />

          <Route path="pipelines">
            <Route index element={<Navigate to="list" replace />} />
            {/* One Ask conversation above both views and both kinds
                (pipelines spec 2026-09-30 §3). */}
            <Route element={<PipelinesAskLayout />}>
              <Route path="list" element={<PipelinesList />} />
              <Route path="board" element={<PipelinesBoard />} />
            </Route>
          </Route>

          {/* Company Brain: one real page now (the metric layer). The mock
              knowledge-graph pages that lived under here were removed. Every
              page needs view_all_accounts except What changed and Waiting on
              you, which every member can open (Waiting spec §2.1). */}
          <Route path="brain/*" element={<BrainRoutes />} />

          {/* Work (spec 2026-10-07 §1.5): Today and Team. The task panel
              opens over any route at ?task=<id> (DashboardLayout). */}
          <Route path="work/*" element={<WorkRoutes />} />

          {/* Catch-all route to avoid losing layout on unimplemented tabs */}
          <Route path="*" element={
            <div className="w-full h-full border-2 border-dashed border-line/60 rounded-xl flex items-center justify-center bg-surface/50 backdrop-blur-sm">
              <p className="text-ink-faint font-medium tracking-wide">Under Construction</p>
            </div>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

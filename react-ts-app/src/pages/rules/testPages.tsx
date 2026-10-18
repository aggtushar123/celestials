// Test-only helpers, never hot-reloaded.
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { capabilitiesForRole } from '../../test/capabilities';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { ScenariosHome } from '../scenarios/ScenariosHome';
import { SegmentPage } from '../segments/SegmentPage';
import { EditRuleRoute, NewRuleRoute, RuleSegmentRoute } from './RuleBuilder';
import { RulePage } from './RulePage';
import { BrainRoutes } from '../brain/BrainRoutes';
import { WorkRoutes } from '../work/WorkRoutes';
import { SendPage } from '../surveys/SendPage';

export type Role = 'admin' | 'csm';

/** The real slices the Rules pages, a segment's page and the Brain
 *  read. The signed-in user is Alice (id 1, testSegments' ME) of "Acme
 *  Inc" unless `who` names another; as a CSM she holds no capability. */
export function makeRulesStore(role: Role = 'admin', who: { id: number; name: string } = { id: 1, name: 'Alice' }) {
  return configureStore({
    reducer: {
      auth: authReducer,
      customers: customersReducer,
      notifications: notificationsReducer,
      files: filesReducer,
      calls: callsReducer,
    },
    preloadedState: {
      auth: {
        user: {
          id: who.id,
          email: 'alice@acme.io',
          name: who.name,
          avatar: '',
          role,
          role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role),
          function: 'cs' as const,
          function_display: 'Customer Success',
          reports_to: null,
          organisation: {
            id: 1,
            name: 'Acme Inc',
            slug: 'acme-inc',
            currency: 'USD' as const,
            currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '',
            ai_agent_enabled: true,
            ai_agent_tone: 'professional' as const,
            ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token',
        refreshToken: 'refresh',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
}

/** The Rules routes on the real store and router, as App.tsx routes them.
 *  Only fetch is stubbed, by the caller (stubRules). `nav` adds the real
 *  Navbar. */
export function renderRules(
  url: string,
  { width = 1440, nav = false, role = 'admin', workPage = false }: { width?: number; nav?: boolean; role?: Role; workPage?: boolean } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role);
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            {workPage ? (
              <Route
                path="/work/*"
                element={
                  <>
                    <WorkRoutes />
                    <Where />
                  </>
                }
              />
            ) : null}
            <Route
              element={
                <>
                  <ScenariosHome />
                  <Where />
                </>
              }
            >
              <Route path="/scenarios" element={null} />
              <Route path="/scenarios/rules/new" element={<NewRuleRoute />} />
            </Route>
            <Route
              path="/scenarios/rules/:id"
              element={
                <>
                  <RulePage />
                  <Where />
                </>
              }
            >
              <Route path="edit" element={<EditRuleRoute />} />
            </Route>
            <Route
              path="/segments/:id"
              element={
                <>
                  <SegmentPage />
                  <Where />
                </>
              }
            >
              <Route path="rule" element={<RuleSegmentRoute />} />
            </Route>
            <Route
              path="/brain/*"
              element={
                <>
                  <BrainRoutes />
                  <Where />
                </>
              }
            />
            <Route
              path="/surveys/:id"
              element={
                <>
                  <SendPage />
                  <Where />
                </>
              }
            />
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}

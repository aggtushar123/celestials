// Test-only helpers, never hot-reloaded.
import type { ReactNode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { List as OrganizationsList } from '../organizations/List';
import { EditSegmentRoute, NewSegmentRoute } from './Builder';
import { SegmentPage } from './SegmentPage';
import { SegmentsList } from './SegmentsList';

// Test-only. The Segments routes on the real store and router, as App.tsx
// routes them. Only fetch is stubbed, by the caller (stubSegments). The
// signed-in user is Alice, id 1 (testSegments' ME).

export function makeSegmentsStore() {
  return configureStore({
    reducer: { auth: authReducer, customers: customersReducer, notifications: notificationsReducer, files: filesReducer, calls: callsReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role: 'admin' as const,
          role_id: 1,
          role_name: 'Admin',
          permissions: ALL_CAPABILITIES,
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

/** One component on the real store and a router at `url`. */
export function renderInApp(ui: ReactNode, { url = '/', width = 1440 }: { url?: string; width?: number } = {}) {
  setViewport(width);
  const store = makeSegmentsStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<>{ui}<Where /></>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

/** The Segments pages at `url`; `nav` adds the real Navbar. */
export function renderSegments(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeSegmentsStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          {/* An always-present in-app link, so tests can exercise the builder's
           * unsaved-changes guard without depending on which app chrome link
           * happens to be rendered underneath. */}
          <Link to="/organizations/list" className="inline-flex min-h-11 items-center">
            Elsewhere
          </Link>
          <Routes>
            <Route element={<><SegmentsList /><Where /></>}>
              <Route path="/segments" element={null} />
              <Route path="/segments/new" element={<NewSegmentRoute />} />
            </Route>
            <Route path="/segments/:id" element={<><SegmentPage /><Where /></>}>
              <Route path="edit" element={<EditSegmentRoute />} />
            </Route>
            <Route path="/organizations/list" element={<><OrganizationsList /><Where /></>} />
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

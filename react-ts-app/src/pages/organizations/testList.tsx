// Test-only helpers, never hot-reloaded: Where sits beside the render
// helpers so a test imports one module, not two.
/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import authReducer from '../../features/auth/authSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { setViewport } from '../../test/viewport';
import { dashboardRoutes } from '../dashboard/routes';
import { OrganizationsAskLayout } from './ask/OrganizationsAskLayout';
import { Board } from './Board';
import { List } from './List';

// Test-only. The real auth, customers and notifications slices (the modals
// dispatch into customers; the Navbar reads notifications). Only fetch is
// stubbed, by the caller, with stubPortfolio() or stubOrganizationsAsk().

export function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function makeStore() {
  return configureStore({
    reducer: { customers: customersReducer, auth: authReducer, notifications: notificationsReducer },
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

/** DashboardLayout's Navbar actions slot. With the real Navbar (`nav`) the
 *  Navbar renders the slot element; without it a bare one stands in
 *  (`data-testid="nav-actions"`). */
function SlotHost({ bare, children }: { bare: boolean; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // With the real Navbar, as DashboardLayout: undefined until the Navbar
  // resolves its title slot, so a PageHeader mounts once, in the bar.
  // Bare (no Navbar): null, so a PageHeader draws in place.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null | undefined>(bare ? null : undefined);
  const value = useMemo(() => ({ slot, setSlot, titleSlot, setTitleSlot }), [slot, titleSlot]);
  return (
    <NavActionsSlotContext.Provider value={value}>
      {bare ? <div ref={setSlot} data-testid="nav-actions" /> : null}
      {children}
    </NavActionsSlotContext.Provider>
  );
}

/** Both Organizations routes (and the organization page they link to) on the
 *  real store and router. `nav` adds the real Navbar, whose List/Board tabs
 *  switch between them carrying the query. `ask` puts both under
 *  OrganizationsAskLayout, as App.tsx does, with the real dashboard routes
 *  beside them (every view a Where) for History's cross-surface handover. */
export function renderOrganizations(
  url: string,
  { width = 1440, nav = false, ask = false }: { width?: number; nav?: boolean; ask?: boolean } = {},
) {
  setViewport(width);
  const store = makeStore();
  const pages = [
    <Route
      key="list"
      path="/organizations/list"
      element={
        <>
          <List />
          <Where />
        </>
      }
    />,
    <Route
      key="board"
      path="/organizations/board"
      element={
        <>
          <Board />
          <Where />
        </>
      }
    />,
  ];
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            {ask ? <Route element={<OrganizationsAskLayout />}>{pages}</Route> : pages}
            <Route path="/organizations/:id" element={<p>Organization page</p>} />
            <Route path="/segments/new" element={<Where />} />
            {ask ? dashboardRoutes(() => <Where />) : null}
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

export function renderList(url = '/organizations/list', { width = 1440 }: { width?: number } = {}) {
  return renderOrganizations(url, { width });
}

export function renderBoard(url = '/organizations/board', { width = 1440 }: { width?: number } = {}) {
  return renderOrganizations(url, { width });
}

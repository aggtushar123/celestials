// Test-only helpers, never hot-reloaded: Where sits beside the render helpers
// so a test imports one module (the brief's interface), not two.
/* eslint-disable react-refresh/only-export-components */
import { useState, type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, useLocation } from 'react-router-dom';
import authReducer from '../../../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../../../test/capabilities';
import { setViewport } from '../../../test/viewport';
import { dashboardRoutes } from '../routes';
import { NavActionsSlotContext } from '../../../layouts/navActionsSlot';

export function authStore() {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role: 'admin', role_id: 1, role_name: 'Admin',
          permissions: ALL_CAPABILITIES, function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
}

/** Where the router is, for asserting on navigation. */
export function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname + location.search}</span>;
}

/** Stands in for the Navbar's actions slot, which DashboardLayout owns. */
export function NavSlotHost({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <NavActionsSlotContext.Provider value={{ slot, setSlot }}>
      <div ref={setSlot} data-testid="nav-actions" />
      {children}
    </NavActionsSlotContext.Provider>
  );
}

/** The real dashboard route tree (DashboardFrame, providers, rail, drill
 *  panel, and the Ask controls in a stand-in Navbar slot) with every view
 *  replaced by `view`, at a given window width. */
export function renderDashboard(url: string, view: () => ReactElement, width = 1440) {
  setViewport(width);
  return render(
    <Provider store={authStore()}>
      <MemoryRouter initialEntries={[url]}>
        <NavSlotHost>
          <Routes>{dashboardRoutes(view)}</Routes>
        </NavSlotHost>
      </MemoryRouter>
    </Provider>,
  );
}

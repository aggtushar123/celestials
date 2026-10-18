// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { AccountsAskLayout } from './ask/AccountsAskLayout';
import { Board } from './Board';
import { AccountDetails } from './Details';
import { List } from './List';

// Test-only. Both Accounts routes on the real auth, customers and
// notifications slices and the real router, as App.tsx routes them. Only
// fetch is stubbed, by the caller, with stubAccountsPortfolio().

export function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

/** Stands in for /accounts/:id (Details.tsx), saying which id it was sent to. */
function AccountPage() {
  const { id } = useParams();
  return <p data-testid="account-page">{`Account page ${id}`}</p>;
}

function makeStore() {
  return configureStore({
    reducer: {
      customers: customersReducer,
      auth: authReducer,
      notifications: notificationsReducer,
      files: filesReducer,
      calls: callsReducer,
    },
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

/** Both Accounts views, and the account page (the real one with `realPage`,
 *  else a stand-in), on the real store and router. `nav` adds the real
 *  Navbar, whose List/Board tabs switch views carrying the query. `ask` puts
 *  the three routes under AccountsAskLayout, as App.tsx does. `url` may
 *  carry navigation state (a History handover). */
export function renderAccounts(
  url: string | { pathname: string; search?: string; state?: unknown },
  {
    width = 1440,
    nav = false,
    realPage = false,
    ask = false,
  }: { width?: number; nav?: boolean; realPage?: boolean; ask?: boolean } = {},
) {
  setViewport(width);
  const store = makeStore();
  const pages = [
    <Route
      key="list"
      path="/accounts/list"
      element={
        <>
          <List />
          <Where />
        </>
      }
    />,
    <Route
      key="board"
      path="/accounts/board"
      element={
        <>
          <Board />
          <Where />
        </>
      }
    />,
    <Route
      key="account"
      path="/accounts/:id"
      element={
        <>
          {realPage ? <AccountDetails /> : <AccountPage />}
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
            {ask ? <Route element={<AccountsAskLayout />}>{pages}</Route> : pages}
            <Route path="/organizations/:id" element={<><p>Organization page</p><Where /></>} />
            <Route path="/segments/new" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

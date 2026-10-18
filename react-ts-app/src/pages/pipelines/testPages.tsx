// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { StrictMode, type ReactNode } from "react";
import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import authReducer from "../../features/auth/authSlice";
import callsReducer from "../../features/calls/callsSlice";
import customersReducer from "../../features/customers/customersSlice";
import filesReducer from "../../features/files/filesSlice";
import notificationsReducer from "../../features/notifications/notificationsSlice";
import { Navbar } from "../../components/layout/Navbar";
import { ALL_CAPABILITIES } from "../../test/capabilities";
import { SlotHost } from "../../test/SlotHost";
import { setViewport } from "../../test/viewport";
import { Board } from "./Board";
import { List } from "./List";
import { PipelinesAskLayout } from "./ask/PipelinesAskLayout";

// Test-only. The Pipelines routes on the real auth, customers and
// notifications slices and the real router, as App.tsx routes them. Only
// fetch is stubbed, by the caller, with stubPipelines().

export function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
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
          email: "alice@acme.io",
          name: "Alice",
          avatar: "",
          role: "admin" as const,
          role_id: 1,
          role_name: "Admin",
          permissions: ALL_CAPABILITIES,
          function: "cs" as const,
          function_display: "Customer Success",
          reports_to: null,
          organisation: {
            id: 1,
            name: "Acme Inc",
            slug: "acme-inc",
            currency: "USD" as const,
            currency_display: "US Dollar ($)",
            default_lifecycle_stage: "",
            ai_agent_enabled: true,
            ai_agent_tone: "professional" as const,
            ai_agent_tone_display: "Professional",
          },
          is_active: true,
        },
        accessToken: "token",
        refreshToken: "refresh",
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
}

/** The Pipelines views on the real store and router. `nav` adds the real
 *  Navbar (List | Board and the kind switch). `strict` renders under
 *  StrictMode, as main.tsx does: mount effects run twice. `ask` puts both
 *  routes under PipelinesAskLayout, as App.tsx does. `url` may carry
 *  navigation state (a History handover). */
export function renderPipelines(
  url: string | { pathname: string; search?: string; state?: unknown },
  {
    width = 1440,
    nav = false,
    strict = false,
    ask = false,
  }: { width?: number; nav?: boolean; strict?: boolean; ask?: boolean } = {},
) {
  setViewport(width);
  const store = makeStore();
  const wrap = (tree: ReactNode) =>
    strict ? <StrictMode>{tree}</StrictMode> : tree;
  const pages = [
    <Route
      key="list"
      path="/pipelines/list"
      element={
        <>
          <List />
          <Where />
        </>
      }
    />,
    <Route
      key="board"
      path="/pipelines/board"
      element={
        <>
          <Board />
          <Where />
        </>
      }
    />,
  ];
  render(
    wrap(
      <Provider store={store}>
        <MemoryRouter initialEntries={[url]}>
          <SlotHost bare={!nav}>
            {nav ? <Navbar /> : null}
            <Routes>
              {ask ? <Route element={<PipelinesAskLayout />}>{pages}</Route> : pages}
              <Route
                path="/organizations/:id"
                element={
                  <>
                    <p>Organization page</p>
                    <Where />
                  </>
                }
              />
              <Route
                path="/accounts/:id"
                element={
                  <>
                    <p>Account page</p>
                    <Where />
                  </>
                }
              />
            </Routes>
          </SlotHost>
        </MemoryRouter>
      </Provider>,
    ),
  );
  return { store };
}

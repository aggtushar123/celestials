// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { BrainNavItem, WorkNavItem } from '../../components/layout/Sidebar';
import { TaskPanelHost } from '../../components/work/TaskPanelHost';
import { DraftRoute } from '../../components/agents/DraftPanel';
import { BrainRoutes } from '../brain/BrainRoutes';
import { SegmentPage } from '../segments/SegmentPage';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore, type Role } from '../rules/testPages';
import { WorkRoutes } from './WorkRoutes';

/** The browser's Back, for a journey that leaves Work and comes back. */
function TestBack() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)} className="min-h-11">
      Test back
    </button>
  );
}

/** `ui` on any route, with the task panel host as DashboardLayout mounts it.
 *  The signed-in user is Alice (id 1) unless `user` names another. Only
 *  fetch is stubbed (stubWork). */
export function renderPage(
  ui: ReactNode,
  url: string,
  { width = 1440, role = 'admin', user }: { width?: number; role?: Role; user?: { id: number; name: string } } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role, user);
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  {ui}
                  <Where />
                </>
              }
            />
          </Routes>
          <TaskPanelHost />
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

export const where = () => screen.getByTestId('where').textContent;

/** The Work routes as App.tsx routes them, with the task panel host; the
 *  real Navbar with `nav`, the sidebar's Work item with `sidebarItem`, its
 *  Brain item (the waiting count's badge) with `brainItem`, Communications'
 *  draft (`DraftRoute`) with `drafts`, the Brain pages with `brain`, and a
 *  segment's page with `segments` (Agents delivery 3's journey). */
export function renderWork(
  url: string,
  {
    width = 1440,
    role = 'admin',
    nav = false,
    sidebarItem = false,
    brainItem = false,
    drafts = false,
    brain = false,
    segments = false,
    user,
  }: {
    width?: number;
    role?: Role;
    nav?: boolean;
    sidebarItem?: boolean;
    brainItem?: boolean;
    drafts?: boolean;
    brain?: boolean;
    segments?: boolean;
    user?: { id: number; name: string };
  } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role, user);
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          {sidebarItem ? <WorkNavItem /> : null}
          {brainItem ? <BrainNavItem /> : null}
          <Routes>
            <Route
              path="/work/*"
              element={
                <>
                  <WorkRoutes />
                  <Where />
                </>
              }
            />
            {drafts ? (
              <Route
                path="/communications"
                element={
                  <>
                    <TestBack />
                    <DraftRoute />
                    <Where />
                  </>
                }
              />
            ) : null}
            {brain ? (
              <Route
                path="/brain/*"
                element={
                  <>
                    <BrainRoutes />
                    <Where />
                  </>
                }
              />
            ) : null}
            {segments ? (
              <Route
                path="/segments/:id"
                element={
                  <>
                    <TestBack />
                    <SegmentPage />
                    <Where />
                  </>
                }
              />
            ) : null}
            <Route path="*" element={<Where />} />
          </Routes>
          <TaskPanelHost />
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

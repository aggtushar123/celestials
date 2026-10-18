// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore, type Role } from '../rules/testPages';
import { NewPlanRoute, RecordPlanRoute } from './NewPlan';
import { PlanPage } from './PlanPage';
import { ProjectsHome } from './ProjectsHome';
import { EditTemplateRoute, NewTemplateRoute } from './TemplateEditor';
import { TemplatesPage } from './TemplatesPage';

/** The browser's Back, for tests that start with `history`. */
function TestBack() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)} className="min-h-11">
      Test back
    </button>
  );
}

/** The Plans routes on the real store and router, as App.tsx routes them.
 *  The signed-in user is Alice (id 1) of "Acme Inc" (makeRulesStore). Only
 *  fetch is stubbed, by the caller (stubPlans). `nav` adds the real Navbar.
 *  `history` are the entries visited before `url`; it adds a Test back button. */
export function renderPlans(
  url: string,
  { width = 1440, nav = false, role = 'admin', history }: { width?: number; nav?: boolean; role?: Role; history?: string[] } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role);
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[...(history ?? []), url]} initialIndex={history?.length ?? 0}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          {history ? <TestBack /> : null}
          <Routes>
            <Route
              element={
                <>
                  <ProjectsHome />
                  <Where />
                </>
              }
            >
              <Route path="/projects" element={null} />
              <Route path="/projects/new" element={<NewPlanRoute />} />
            </Route>
            <Route
              path="/projects/templates"
              element={
                <>
                  <TemplatesPage />
                  <Where />
                </>
              }
            >
              <Route path="new" element={<NewTemplateRoute />} />
              <Route path=":templateId/edit" element={<EditTemplateRoute />} />
            </Route>
            <Route
              path="/projects/:id"
              element={
                <>
                  <PlanPage />
                  <Where />
                </>
              }
            />
            {(['organization', 'account'] as const).map((kind) => (
              <Route
                key={kind}
                path={kind === 'organization' ? '/organizations/:id' : '/accounts/:id'}
                element={
                  <>
                    <p>{kind === 'organization' ? 'Organization page' : 'Account page'}</p>
                    <Outlet />
                    <Where />
                  </>
                }
              >
                <Route path="plans/new" element={<RecordPlanRoute kind={kind} />} />
              </Route>
            ))}
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}

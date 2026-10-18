// Test-only helpers, never hot-reloaded.
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { EditSegmentRoute } from '../segments/Builder';
import { makeSegmentsStore } from '../segments/testPages';
import { SegmentPage } from '../segments/SegmentPage';
import { HostedForm } from './HostedForm';
import { SendPage } from './SendPage';
import { EditSurveyRoute, NewSurveyRoute, SurveySegmentRoute } from './SurveyBuilder';
import { SurveysHome } from './SurveysHome';

/** The hosted form at /s/<token> with no store at all: it must never read
 *  the session, so any store read would throw here. Phone width by default. */
export function renderHosted(token: string, { width = 375 }: { width?: number } = {}) {
  setViewport(width);
  const view = render(
    <MemoryRouter initialEntries={[`/s/${encodeURIComponent(token)}`]}>
      <Routes>
        <Route path="/s/:token" element={<HostedForm />} />
      </Routes>
    </MemoryRouter>,
  );
  return { unmount: view.unmount };
}

/** The Surveys routes on the real store and router, as App.tsx routes them.
 *  Only fetch is stubbed, by the caller (stubSurveys). The signed-in user is
 *  Alice (id 1) of "Acme Inc"; `nav` adds the real Navbar. */
export function renderSurveys(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeSegmentsStore();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              element={
                <>
                  <SurveysHome />
                  <Where />
                </>
              }
            >
              <Route path="/surveys" element={null} />
              <Route path="/surveys/new" element={<NewSurveyRoute />} />
            </Route>
            <Route
              path="/surveys/:id"
              element={
                <>
                  <SendPage />
                  <Where />
                </>
              }
            >
              <Route path="edit" element={<EditSurveyRoute />} />
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
              <Route path="edit" element={<EditSegmentRoute />} />
              <Route path="survey" element={<SurveySegmentRoute />} />
            </Route>
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}

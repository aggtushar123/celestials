// Test-only helpers, never hot-reloaded.
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore } from '../rules/testPages';
import { EditCampaignRoute, NewCampaignRoute } from './CampaignBuilder';
import { CampaignPage } from './CampaignPage';
import { CampaignsHome } from './CampaignsHome';
import { Unsubscribe } from './Unsubscribe';

/** The Campaigns routes on the real store and router, as App.tsx routes
 *  them. The signed-in user is Alice (id 1) of "Acme Inc". Only fetch is
 *  stubbed, by the caller (stubCampaigns); `nav` adds the real Navbar. */
export function renderCampaigns(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeRulesStore();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              element={
                <>
                  <CampaignsHome />
                  <Where />
                </>
              }
            >
              <Route path="/campaigns" element={null} />
              <Route path="/campaigns/new" element={<NewCampaignRoute />} />
            </Route>
            <Route
              path="/campaigns/:id"
              element={
                <>
                  <CampaignPage />
                  <Where />
                </>
              }
            >
              <Route path="edit" element={<EditCampaignRoute />} />
            </Route>
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}

/** The unsubscribe page at /u/<token> with no store at all: it must never
 *  read the session, so any store read would throw here. Phone width by default. */
export function renderUnsubscribe(token: string, { width = 375 }: { width?: number } = {}) {
  setViewport(width);
  const view = render(
    <MemoryRouter initialEntries={[`/u/${encodeURIComponent(token)}`]}>
      <Routes>
        <Route path="/u/:token" element={<Unsubscribe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { unmount: view.unmount };
}

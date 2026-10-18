// Test-only: the account page on the real store and router. Never hot-reloaded.
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { makeDetailStore } from '../organizations/testDetail';
import { AccountDetails } from './Details';
import { Where } from './testList';

/** /accounts/:id as App.tsx routes it, with markers (each a Where) for the
 *  places it links to. `nav` adds the real Navbar. Only fetch is stubbed, by
 *  the caller (stubAccountPage). */
export function renderAccountPage(url = '/accounts/12', { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeDetailStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              path="/accounts/:id"
              element={
                <>
                  <AccountDetails />
                  <Where />
                </>
              }
            >
              <Route path="plans/new" element={<p>Plan modal</p>} />
            </Route>
            {['/accounts/list', '/organizations/:id', '/contacts/:id', '/canvas/create', '/canvas/:id'].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <>
                    <p>Elsewhere</p>
                    <Where />
                  </>
                }
              />
            ))}
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

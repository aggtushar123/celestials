// Test-only helpers, never hot-reloaded.
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { BrainNavItem } from '../../components/layout/Sidebar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore, type Role } from '../rules/testPages';
import { BrainRoutes } from './BrainRoutes';

/** The Brain routes on the real store and router, as App.tsx routes them.
 *  The signed-in user is Alice (id 1) unless `user` names another (Doing: a
 *  CSM, then their manager). Only fetch is stubbed (stubBrain). `url` may
 *  carry navigation state (a History handover from another surface). */
export function renderBrain(
  url: string | { pathname: string; search?: string; state?: unknown },
  {
    width = 1440,
    role = 'admin',
    nav = false,
    brainLink = false,
    user,
  }: { width?: number; role?: Role; nav?: boolean; brainLink?: boolean; user?: { id: number; name: string } } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role, user);
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          {brainLink ? <BrainNavItem /> : null}
          <Routes>
            <Route path="/brain/*" element={<><BrainRoutes /><Where /></>} />
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}

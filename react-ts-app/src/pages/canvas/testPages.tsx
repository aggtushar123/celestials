// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { MapsTab } from '../../components/canvas/MapsTab';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore } from '../rules/testPages';
import { CanvasPage } from './CanvasPage';
import { MapEditor } from './MapEditor';

const NAMES: Record<string, string> = { organization: 'Pizza Hut', account: 'Pizza EMEA' };

/** A record page's Maps tab, standing in for the organisation and account pages. */
function RecordStandIn({ kind }: { kind: 'organization' | 'account' }) {
  const { id } = useParams();
  return (
    <>
      <MapsTab record={{ kind, id: Number(id), name: NAMES[kind] }} />
      <Where />
    </>
  );
}

/** A button that moves the router elsewhere while the page stays mounted. */
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)} className="min-h-11">
      Go to {to}
    </button>
  );
}

/** The Canvas routes on the real store and router, as App.tsx routes them.
 *  The signed-in user is Alice (id 1). Only fetch is stubbed (stubCanvases). */
export function renderCanvas(url: string, { width = 1440, nav = false, goTo }: { width?: number; nav?: boolean; goTo?: string } = {}) {
  setViewport(width);
  const store = makeRulesStore();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          {goTo ? <GoTo to={goTo} /> : null}
          <Routes>
            <Route path="/canvas" element={<><CanvasPage /><Where /></>} />
            <Route path="/canvas/:id" element={<><MapEditor /><Where /></>} />
            <Route path="/organizations/:id" element={<RecordStandIn kind="organization" />} />
            <Route path="/accounts/:id" element={<RecordStandIn kind="account" />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}

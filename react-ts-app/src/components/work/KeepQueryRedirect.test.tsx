import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { KeepQueryRedirect } from './KeepQueryRedirect';
import { OPENED_HERE, openedHere } from './useTaskLink';

function Probe() {
  const { pathname, search, state } = useLocation();
  return (
    <p data-testid="probe" data-here={openedHere(state) ? 'yes' : 'no'}>
      {pathname + search}
    </p>
  );
}

function go(entry: { pathname: string; search?: string; state?: unknown }) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/work/today" element={<KeepQueryRedirect to="/work/mine" />} />
        <Route path="/work/recommended" element={<KeepQueryRedirect to="/work/mine" set={{ kind: 'suggestion' }} />} />
        <Route path="/work/mine" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId('probe');
}

describe('KeepQueryRedirect (Decision 15)', () => {
  it('keeps the query and the bell’s opened-here state, so Close still steps back', () => {
    const probe = go({ pathname: '/work/today', search: '?task=41', state: OPENED_HERE });
    expect(probe).toHaveTextContent('/work/mine?task=41');
    expect(probe).toHaveAttribute('data-here', 'yes');
  });

  it('sets its own keys on top of the query, replacing one already there', () => {
    expect(go({ pathname: '/work/recommended', search: '?kind=task&scope=team' })).toHaveTextContent('/work/mine?kind=suggestion&scope=team');
  });

  it('adds no ? when there is no query', () => {
    const probe = go({ pathname: '/work/today' });
    expect(probe).toHaveTextContent(/^\/work\/mine$/);
    expect(probe).toHaveAttribute('data-here', 'no');
  });
});

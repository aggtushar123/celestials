import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { FILTER_OPTIONS } from '../../../features/organizations/testPortfolio';
import type { SurfaceContext } from '../../copilot/types';
import { useAsk } from '../../dashboard/ask/useAsk';
import { OrganizationsAskLayout } from './OrganizationsAskLayout';
import { useReportPortfolioOptions } from './portfolioOptions';
import { useAskFocusOnOpen } from './useAskFocus';

function Page({ name }: { name: string }) {
  const ask = useAsk()!;
  const [openId, setOpenId] = useState<number | null>(null);
  useReportPortfolioOptions(FILTER_OPTIONS);
  useAskFocusOnOpen(openId);
  const { context, chipLabel } = ask.surface;
  return (
    <div>
      <p data-testid="page">{name}</p>
      <p data-testid="surface">{ask.surface.name}</p>
      <p data-testid="view">{context?.surface === 'organizations' ? context.view : 'none'}</p>
      {/* ask.focus is the shared DashboardFocus | null slot; on Organizations
          it is only ever a companies focus (useAskFocusOnOpen), narrower
          than OrganizationsContext.focus's own type expects statically. */}
      <p data-testid="chip">{context ? chipLabel({ ...context, focus: ask.focus } as SurfaceContext) : 'none'}</p>
      <p data-testid="conversation">{ask.conversation?.title ?? 'none'}</p>
      <button type="button" onClick={() => ask.setConversation({ id: 3, title: 'Kept', created_at: '', updated_at: '', messages: [] })}>
        Start
      </button>
      <button type="button" onClick={() => setOpenId(7)}>Open Pizza Hut</button>
      <button type="button" onClick={() => setOpenId(null)}>Close Pizza Hut</button>
      <Link to="/organizations/board?owner=2">Board</Link>
    </div>
  );
}

function renderLayout(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/organizations" element={<OrganizationsAskLayout />}>
          <Route path="list" element={<Page name="List" />} />
          <Route path="board" element={<Page name="Board" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrganizationsAskLayout', () => {
  it('asks from the organizations surface, naming filters from the options a page reports', async () => {
    renderLayout('/organizations/list?owner=2');
    expect(screen.getByTestId('surface')).toHaveTextContent('organizations');
    expect(screen.getByTestId('view')).toHaveTextContent('list');
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Organizations · Owner: Carl CSM'));
  });

  it('focuses an opened account, and keeps the focus when it closes', async () => {
    renderLayout('/organizations/list');
    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    await waitFor(() => expect(screen.getByTestId('chip')).toHaveTextContent('Organizations · 1 account'));
    await userEvent.click(screen.getByRole('button', { name: 'Close Pizza Hut' }));
    expect(screen.getByTestId('chip')).toHaveTextContent('Organizations · 1 account');
  });

  it('keeps one conversation across the List and the Board', async () => {
    renderLayout('/organizations/list?owner=2');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await userEvent.click(screen.getByRole('link', { name: 'Board' }));
    expect(screen.getByTestId('page')).toHaveTextContent('Board');
    expect(screen.getByTestId('view')).toHaveTextContent('board');
    expect(screen.getByTestId('conversation')).toHaveTextContent('Kept');
  });
});

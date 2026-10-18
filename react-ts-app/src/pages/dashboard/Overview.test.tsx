import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import forecastReducer from '../../features/forecast/forecastSlice';
import healthReducer from '../../features/health/healthSlice';
import ticketsReducer from '../../features/tickets/ticketsSlice';
import { dashboardRoutes } from './routes';
import { attentionBody, mockOverviewFetch, urlsFor } from './overview/fixtures';

// End-to-end tier (DOM-level): the real dashboard route tree — frame, drill
// provider, Overview, toolbar, list and cards — with only fetch mocked.

function renderOverview(url: string) {
  const store = configureStore({
    reducer: { auth: authReducer, forecast: forecastReducer, health: healthReducer, tickets: ticketsReducer },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>{dashboardRoutes()}</Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('Overview', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the attention list with the shared filters', async () => {
    const spy = mockOverviewFetch();
    renderOverview('/dashboard/overview?owner=2');
    expect(await screen.findByRole('link', { name: 'Uber' })).toHaveAttribute('href', '/organizations/12');
    expect(urlsFor(spy, '/dashboard/attention/')[0]).toContain('owner=2');
  });

  it('renders the book filters with options from the response', async () => {
    mockOverviewFetch();
    renderOverview('/dashboard/overview');
    await screen.findByRole('link', { name: 'Uber' });
    expect(within(screen.getByLabelText('Primary Owner')).getByRole('option', { name: 'Carl CSM' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Lifecycle Stage')).getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Account')).getByRole('option', { name: 'Uber' })).toBeInTheDocument();
    // No sub-view switch on the Overview.
    expect(screen.queryByRole('navigation', { name: 'Views' })).not.toBeInTheDocument();
  });

  it('refetches when a filter changes', async () => {
    const spy = mockOverviewFetch();
    renderOverview('/dashboard/overview');
    await screen.findByRole('link', { name: 'Uber' });
    expect(urlsFor(spy, '/dashboard/attention/')).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText('Primary Owner'), '2');
    await waitFor(() => expect(urlsFor(spy, '/dashboard/attention/')).toHaveLength(2));
    expect(urlsFor(spy, '/dashboard/attention/')[1]).toContain('owner=2');
    // The previous list stays on screen while the refetch runs.
    expect(screen.getByRole('link', { name: 'Uber' })).toBeInTheDocument();
  });

  it('shows the error state when the list fails, not an empty list', async () => {
    mockOverviewFetch(['/dashboard/attention/']);
    renderOverview('/dashboard/overview');
    expect(await screen.findByText('Could not load what needs attention.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs you right now.')).not.toBeInTheDocument();
  });

  it('keeps an Undo to the filter it was made under', async () => {
    const spy = mockOverviewFetch();
    const base = spy.getMockImplementation()!;
    const lyft = { ...attentionBody.items[0], key: 'risk:3', kind: 'risk', title: 'Lyft', customer_id: 3 };
    const filters = { ...attentionBody.filters, owners: [...attentionBody.filters.owners, { value: '3', name: 'Dana CSM' }] };
    let snoozed = false;
    spy.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/dashboard/attention/snooze/')) {
        snoozed = true;
        return { ok: true, status: 201, json: async () => ({ key: 'renewal:12', until: null }) };
      }
      if (!url.includes('/dashboard/attention/')) return base(url, init);
      // owner=3 holds a disjoint set; owner=2 omits Uber once it is snoozed.
      const owner3 = url.includes('owner=3');
      const items = owner3 ? [lyft] : snoozed ? [] : attentionBody.items;
      return { ok: true, status: 200, json: async () => ({ ...attentionBody, filters, items }) };
    });

    renderOverview('/dashboard/overview?owner=2');
    await screen.findByRole('link', { name: 'Uber' });
    await userEvent.click(screen.getByRole('button', { name: 'Snooze Uber for 7 days' }));
    expect(await screen.findByText(/Snoozed/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Primary Owner'), '3');
    expect(await screen.findByRole('link', { name: 'Lyft' })).toBeInTheDocument();
    expect(screen.queryByText(/Snoozed/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Needs attention' })).getAllByRole('listitem')).toHaveLength(1);

    await userEvent.selectOptions(screen.getByLabelText('Primary Owner'), '2');
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Uber' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Snoozed/)).not.toBeInTheDocument();
  });
});

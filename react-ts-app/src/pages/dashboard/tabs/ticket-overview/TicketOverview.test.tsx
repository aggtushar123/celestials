import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ticketsReducer from '../../../../features/tickets/ticketsSlice';
import authReducer from '../../../../features/auth/authSlice';
import { AreaLayout } from '../../AreaLayout';
import { TicketOverviewContainer } from './TicketOverviewContainer';
import { ControlsView } from './ControlsView';
import { niceMax, ticksTo } from './chartTheme';
import { DrillProvider } from '../../drill/DrillContext';
import { DrillPanel } from '../../drill/DrillPanel';
import { mockFetchRouted, drillResponse } from '../../drill/testDrill';

// Integration tier: container + view + charts through the real router,
// with only the fetch boundary mocked. Recharts needs a sized
// container, which jsdom doesn't give it — so these assert on the
// numbers and controls, not on rendered SVG paths.

const stats = {
  kpis: {
    total: 735,
    on_hold: 42,
    avg_lifetime_days: 13.95,
    resolution_rate: 61.9,
    positive_sentiment: 379,
    negative_sentiment: 119,
  },
  priority: [
    { name: 'Critical', value: 73 },
    { name: 'High', value: 135 },
    { name: 'Medium', value: 267 },
    { name: 'Low', value: 260 },
  ],
  status: [
    { name: 'Open', value: 120 },
    { name: 'In Progress', value: 118 },
    { name: 'On Hold', value: 42 },
    { name: 'Resolved', value: 304 },
    { name: 'Closed', value: 151 },
  ],
  origin: [
    { name: 'Slack', value: 346, provider: 'slack', connector_id: 3 },
    { name: 'Zendesk', value: 169, provider: 'zendesk', connector_id: 1 },
    { name: 'Revenact', value: 71, provider: '', connector_id: null },
  ],
  assignees: [
    { name: 'Quiet', Open: 1, 'In Progress': 0, 'On Hold': 0, Resolved: 2, Closed: 0, total: 3 },
    { name: 'Busy', Open: 16, 'In Progress': 21, 'On Hold': 10, Resolved: 54, Closed: 31, total: 132 },
    // Unassigned tickets group under a blank name — not a real `assignee:`
    // segment the backend will drill (see the drill suite below).
    { name: '', Open: 4, 'In Progress': 0, 'On Hold': 0, Resolved: 0, Closed: 0, total: 4 },
  ],
  sentiment_timeline: [
    { date: 'Aug 2026', positive: 43, negative: 13 },
    { date: 'Sep 2026', positive: 24, negative: 7 },
  ],
  filters: {
    owners: [{ id: 5, name: 'Carl CSM' }],
    customers: [{ id: 7, name: 'Pizza Hut' }],
    accounts: [{ id: 2, name: 'Apple EMEA' }],
    connectors: [{ id: 1, name: 'Zendesk', provider: 'zendesk' }],
    priorities: [
      { value: 'critical', name: 'Critical' },
      { value: 'low', name: 'Low' },
    ],
  },
};

function mockFetch(body: unknown = stats, status = 200) {
  // Typed as taking a URL so `mock.calls[0][0]` is a string rather
  // than an empty tuple. `vi.fn<...>()` declares the signature without
  // naming parameters the implementation doesn't use.
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderTickets(url = '/dashboard/support/tickets') {
  // `auth` is here only so `useOrgCurrency` (read by the drill panel's row
  // list) has a slice to select from. `DrillProvider` + `DrillPanel` mirror
  // DashboardFrame's real, app-wide pairing so a click on a drillable Kpi or
  // chart segment opens a real dialog instead of throwing on a missing
  // `useDrill()` provider.
  const store = configureStore({ reducer: { tickets: ticketsReducer, auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <DrillProvider>
          <Routes>
            <Route path="/dashboard/support" element={<AreaLayout area="support" />}>
              <Route element={<TicketOverviewContainer />}>
                <Route path="tickets" element={<ControlsView />} />
              </Route>
            </Route>
          </Routes>
          <DrillPanel />
        </DrillProvider>
      </MemoryRouter>
    </Provider>
  );
  return store;
}

const lastUrl = (spy: ReturnType<typeof mockFetch>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0];

describe('Ticket Overview', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches real stats on mount instead of reading a fixture', async () => {
    const fetchMock = mockFetch();
    renderTickets();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/tickets/stats/'),
        expect.objectContaining({ method: 'GET' })
      )
    );
  });

  it('renders the real KPI figures', async () => {
    mockFetch();
    renderTickets();

    // The label renders before the fetch resolves — wait for a real figure
    // first, or the card lookups below race a still-loading "—".
    await waitFor(() => expect(screen.getAllByText('735').length).toBeGreaterThan(0));

    // Scoped to each card: 735 legitimately appears three times — the
    // KPI plus both donut centres, since priority and status each sum
    // to the total. That agreement is the point, so the assertion
    // targets the card rather than asserting the number is unique.
    const card = async (label: string) =>
      within((await screen.findByText(label)).parentElement!);

    expect((await card('Total Ticket Volume')).getByText('735')).toBeInTheDocument();
    expect((await card('Tickets On Hold')).getByText('42')).toBeInTheDocument();
    expect((await card('Avg. Ticket Lifetime (Days)')).getByText('13.95')).toBeInTheDocument();
    expect((await card('Ticket Resolution Rate')).getByText('61.9%')).toBeInTheDocument();
  });

  it('the donut centres agree with the KPI total', async () => {
    mockFetch();
    renderTickets();

    // Each donut sums its own buckets client-side; if they disagreed
    // with the KPI, one of the three aggregations would be wrong.
    await waitFor(() => expect(screen.getAllByText('735')).toHaveLength(3));
  });

  it('shows an em-dash rather than a zero before the first response', () => {
    // "0 tickets" is a claim; "—" is an admission that nothing has
    // loaded yet.
    mockFetch();
    renderTickets();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('surfaces a failed load without blanking the page', async () => {
    mockFetch({ detail: 'Not found.' }, 404);
    renderTickets();

    expect(await screen.findByRole('alert')).toHaveTextContent('Not found.');
  });

  // ── the filter bar ───────────────────────────────────────────────

  it('offers the four filters as real controls, not as navigation', async () => {
    // They used to be NavLinks to routes that fell through to a
    // placeholder — clicking one unmounted the whole dashboard.
    mockFetch();
    renderTickets();

    for (const label of ['Ticket Date', 'Primary Owner', 'Ticket Priority', 'Account']) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    }
  });

  it('populates filter options from the response, not from a hardcoded list', async () => {
    mockFetch();
    renderTickets();

    const owner = (await screen.findByLabelText('Primary Owner')) as HTMLSelectElement;
    await waitFor(() =>
      expect([...owner.options].map((o) => o.textContent)).toEqual(['All', 'Carl CSM'])
    );
  });

  it('refetches with the chosen priority', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderTickets();

    await screen.findByText('Total Ticket Volume');
    await waitFor(() => expect(screen.getAllByText('735').length).toBeGreaterThan(0));
    await user.selectOptions(screen.getByLabelText('Ticket Priority'), 'critical');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('priority=critical'),
        expect.anything()
      )
    );
  });

  it('turns a date preset into a real from= bound', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderTickets();

    await screen.findByText('Total Ticket Volume');
    await waitFor(() => expect(screen.getAllByText('735').length).toBeGreaterThan(0));
    await user.selectOptions(screen.getByLabelText('Ticket Date'), '30');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/from=\d{4}-\d{2}-\d{2}/),
        expect.anything()
      )
    );
  });

  it('turns the URL date preset into a from= date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
    vi.stubGlobal('fetch', fetchMock);
    renderTickets('/dashboard/support/tickets?days=30&priority=high');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);
    expect(url).toContain('priority=high');
  });

  it('shows the current selection on the chip and offers to clear it', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderTickets();

    await screen.findByText('Total Ticket Volume');
    await waitFor(() => expect(screen.getAllByText('735').length).toBeGreaterThan(0));
    await user.selectOptions(screen.getByLabelText('Ticket Priority'), 'critical');

    // Asserted on the control's value rather than the chip's text:
    // the label wraps both the visible chip and the invisible select,
    // so "Critical" legitimately appears twice inside it.
    const priority = screen.getByLabelText('Ticket Priority') as HTMLSelectElement;
    expect(priority.value).toBe('critical');

    await user.click(await screen.findByRole('button', { name: /Clear 1/ }));
    expect(priority.value).toBe('');

    await waitFor(() => expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull());
  });

  it('sends no query at all when nothing is filtered', async () => {
    const fetchMock = mockFetch();
    renderTickets();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Every call, not just the last — a stray query on an earlier fetch
    // (e.g. a double fetch on mount) would otherwise go unnoticed.
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('?');
    }
  });

  it('treats a malformed days value as absent rather than crashing', async () => {
    // A hand-edited or corrupted link (?days=abc) used to reach
    // isoDaysAgo(NaN), whose toISOString() throws mid-render.
    const fetchMock = mockFetch();
    renderTickets('/dashboard/support/tickets?days=abc');

    await screen.findByText('Total Ticket Volume');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastUrl(fetchMock)).not.toContain('from=');
  });
});

// ── drill (server) ──────────────────────────────────────────────────

describe('Ticket Overview drill', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the Total drill against the server', async () => {
    const fetchMock = mockFetchRouted(stats, {
      all: drillResponse(
        [{ id: 7, name: 'Pizza Hut', owner: 'Carl CSM', arr: 69_600, value: 735 }],
        'tickets',
      ),
    });
    const user = userEvent.setup();
    renderTickets();

    await user.click(
      await screen.findByRole('button', { name: 'Total Ticket Volume 735, show accounts' })
    );

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('/api/v1/tickets/stats/?drill=all'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(dialog).getByText('735 tickets')).toBeInTheDocument();
  });

  it('carries the current filters into a KPI drill request', async () => {
    const fetchMock = mockFetchRouted(stats, { on_hold: drillResponse([], 'tickets') });
    const user = userEvent.setup();
    renderTickets('/dashboard/support/tickets?owner=5');

    await user.click(await screen.findByRole('button', { name: 'Tickets On Hold 42, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/tickets/stats/?owner=5&drill=on_hold')
    );
  });

  it('drills into the Critical slice of the priority donut, translating the label to the real value', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'priority:critical': drillResponse(
        [{ id: 7, name: 'Pizza Hut', owner: 'Carl CSM', arr: 69_600, value: 73 }],
        'tickets',
      ),
    });
    const user = userEvent.setup();
    renderTickets();

    await user.click(await screen.findByRole('button', { name: 'Critical 73, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/tickets/stats/?drill=priority%3Acritical')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('drills into the In Progress slice of the status donut', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'status:in-progress': drillResponse(
        [{ id: 7, name: 'Pizza Hut', owner: 'Carl CSM', arr: 69_600, value: 118 }],
        'tickets',
      ),
    });
    const user = userEvent.setup();
    renderTickets();

    await user.click(await screen.findByRole('button', { name: 'In Progress 118, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/tickets/stats/?drill=status%3Ain-progress')
    );
  });

  it('drills into the null-connector origin bucket as origin:none', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'origin:none': drillResponse(
        [{ id: 7, name: 'Pizza Hut', owner: 'Carl CSM', arr: 69_600, value: 71 }],
        'tickets',
      ),
    });
    const user = userEvent.setup();
    renderTickets();

    await user.click(await screen.findByRole('button', { name: 'Revenact 71, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/tickets/stats/?drill=origin%3Anone')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('drills into a connected origin bar by its connector id', async () => {
    const fetchMock = mockFetchRouted(stats, { 'origin:3': drillResponse([], 'tickets') });
    const user = userEvent.setup();
    renderTickets();

    await user.click(await screen.findByRole('button', { name: 'Slack 346, show accounts' }));

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('/api/v1/tickets/stats/?drill=origin%3A3'));
  });

  it('drills into the whole assignee bar, not a single status segment of it', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'assignee:Busy': drillResponse(
        [{ id: 7, name: 'Pizza Hut', owner: 'Carl CSM', arr: 69_600, value: 132 }],
        'tickets',
      ),
    });
    const user = userEvent.setup();
    renderTickets();

    await user.click(await screen.findByRole('button', { name: 'Busy 132, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/tickets/stats/?drill=assignee%3ABusy')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('offers no drill for the blank-assignee bar', async () => {
    mockFetchRouted(stats, {});
    renderTickets();

    await screen.findByText('Ticket Assignees by Ticket Status');
    expect(screen.queryByRole('button', { name: /^ 4, show accounts$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '4, show accounts' })).not.toBeInTheDocument();
  });

  it('does not make a button of the non-drillable KPIs', async () => {
    mockFetchRouted(stats, {});
    renderTickets();

    await screen.findByText('Total Ticket Volume');
    expect(screen.getByText('13.95').closest('button')).toBeNull();
    expect(screen.getByText('61.9%').closest('button')).toBeNull();
  });
});

describe('chart axis scaling', () => {
  it('rounds up past the data rather than clipping it', () => {
    // The mock hard-coded domain={[0, 400]}; a 735-ticket bar would
    // have been drawn off the top of the chart.
    expect(niceMax([369, 366])).toBe(400);
    expect(niceMax([735])).toBe(800);
    expect(niceMax([132])).toBe(200);
  });

  it('falls back for an empty or zero dataset', () => {
    expect(niceMax([])).toBe(10);
    expect(niceMax([0, 0])).toBe(10);
  });

  it('spaces ticks evenly up to the max', () => {
    expect(ticksTo(400)).toEqual([0, 100, 200, 300, 400]);
    expect(ticksTo(100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });
});

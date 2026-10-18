import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import interactionsReducer from '../../../../features/interactions/interactionsSlice';
import authReducer from '../../../../features/auth/authSlice';
import { AreaLayout } from '../../AreaLayout';
import { AITrendingTopics } from '../AITrendingTopics';
import { ControlsView } from './ControlsView';
import { compact, niceMax, percentOf } from './chartTheme';
import { DrillProvider } from '../../drill/DrillContext';
import { DrillPanel } from '../../drill/DrillPanel';
import { mockFetchRouted, drillResponse } from '../../drill/testDrill';

// Integration tier: container + view + charts through the real router, with only
// the fetch boundary mocked. Recharts needs a sized container, which jsdom
// doesn't give it — so these assert on the numbers, labels and controls, not on
// rendered SVG paths.

const stats = {
  total: 981,
  classified: 981,
  by_type: [
    { key: 'email', name: 'Email', value: 64 },
    { key: 'call', name: 'Call', value: 182 },
    { key: 'ticket', name: 'Ticket', value: 735 },
  ],
  sentiment: [
    { key: 'positive', name: 'Positive', value: 578 },
    { key: 'neutral', name: 'Neutral', value: 246 },
    { key: 'negative', name: 'Negative', value: 157 },
  ],
  areas: [
    { key: 'product_growth', name: 'Product & Growth', value: 407 },
    { key: 'support_operations', name: 'Support & Operations', value: 309 },
    { key: 'customer_success', name: 'Customer Success', value: 265 },
  ],
  categories: [
    { key: 'account_management', name: 'Account Management', value: 235 },
    { key: 'reporting_analytics', name: 'Reporting & Analytics', value: 195 },
  ],
  subcategories: [
    { key: 'user_access', name: 'User Access', value: 165 },
    { key: 'export_problem', name: 'Export Problem', value: 132 },
  ],
  sentiment_timeline: [
    { date: 'Sep 15, 2025', positive: 2, neutral: 1, negative: 0 },
    { date: 'Sep 22, 2025', positive: 1, neutral: 3, negative: 1 },
  ],
  recent: [
    {
      id: 'call:93',
      source: 'Call',
      account: 'WeWork',
      title: 'Expansion Discovery Call',
      sentiment: 'Neutral',
      area: 'Customer Success',
      category: 'Account Management',
      subcategory: 'User Access',
      keys: { sentiment: 'neutral', area: 'product_growth', category: 'bug_report', subcategory: 'ui_bug' },
      corrected: false,
      occurred_on: '2026-09-10',
    },
    {
      id: 'email:12',
      source: 'Email',
      account: 'Apple Inc',
      title: 'Export to CSV is missing columns',
      sentiment: 'Negative',
      area: '',
      category: '',
      subcategory: '',
      keys: { sentiment: 'neutral', area: 'product_growth', category: 'bug_report', subcategory: 'ui_bug' },
      corrected: false,
      occurred_on: '2026-09-08',
    },
  ],
  filters: {
    customers: [{ id: 7, name: 'Pizza Hut' }],
    accounts: [{ id: 2, name: 'Apple EMEA' }],
    types: [
      { value: 'email', name: 'Email' },
      { value: 'call', name: 'Call' },
      { value: 'ticket', name: 'Ticket' },
    ],
    sentiments: [
      { value: 'positive', name: 'Positive' },
      { value: 'negative', name: 'Negative' },
    ],
    areas: [{ value: 'product_growth', name: 'Product & Growth' }],
    categories: [
      { value: 'bug_report', name: 'Bug Report' },
      { value: 'onboarding', name: 'Onboarding' },
    ],
    subcategories: [
      { value: 'ui_bug', name: 'UI Bug', category: 'bug_report' },
      { value: 'setup_assistance', name: 'Setup Assistance', category: 'onboarding' },
    ],
    revenue_brackets: [
      { value: 'under_25k', name: 'Under $25K' },
      { value: 'over_100k', name: '$100K and above' },
    ],
  },
};

function mockFetch(body: unknown = stats, status = 200) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderTopics(url = '/dashboard/support/topics') {
  // `auth` is here only so `useOrgCurrency` (read by the drill panel's row
  // list) has a slice to select from. `DrillProvider` + `DrillPanel` mirror
  // DashboardFrame's real, app-wide pairing so a click on a drillable chart
  // segment opens a real dialog instead of throwing on a missing
  // `useDrill()` provider.
  const store = configureStore({ reducer: { interactions: interactionsReducer, auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <DrillProvider>
          <Routes>
            <Route path="/dashboard/support" element={<AreaLayout area="support" />}>
              <Route element={<AITrendingTopics />}>
                <Route path="topics" element={<ControlsView />} />
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

/** The last URL fetch was called with, for asserting on the query string. */
function lastUrl(spy: ReturnType<typeof mockFetch>) {
  return spy.mock.calls[spy.mock.calls.length - 1][0];
}

describe('AI Trending Topics', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches real stats on mount instead of reading a fixture', async () => {
    const fetchMock = mockFetch();
    renderTopics();

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/interactions/stats/'),
        expect.objectContaining({ method: 'GET' })
      )
    );
  });

  it('renders the real source counts', async () => {
    mockFetch();
    renderTopics();

    // Three donut centres legitimately read 981: source and sentiment each
    // partition every interaction, and area does too when all of them are
    // classified. That agreement is the point — if one disagreed, one of the
    // three aggregations would be wrong — so this asserts all three summed
    // what the API sent rather than that the number is unique on the page.
    expect(await screen.findAllByText('981')).toHaveLength(3);
  });

  it('renders the detail table from the API, including a classified row', async () => {
    mockFetch();
    renderTopics();

    const row = (await screen.findByText('Expansion Discovery Call')).closest('tr')!;

    expect(within(row).getByText('Call')).toBeInTheDocument();
    expect(within(row).getByText('WeWork')).toBeInTheDocument();
    expect(within(row).getByText('Account Management')).toBeInTheDocument();
    expect(within(row).getByText('User Access')).toBeInTheDocument();
  });

  it('keeps the detail table room for its rows when the cards stack below xl (UI broken-things fix 19)', async () => {
    mockFetch();
    renderTopics();
    const heading = await screen.findByRole('heading', { name: 'Detailed Activity Breakdown' });
    // The table's card, then the row it shares with the type donut.
    const card = heading.parentElement!.parentElement!.parentElement!;
    expect(card).toHaveClass('min-h-[420px]', 'shrink-0', 'xl:shrink');
    const row = card.parentElement!;
    // Below xl the row grows with its stacked cards instead of squeezing them.
    expect(row).toHaveClass('flex-col', 'xl:flex-row', 'xl:h-full', 'shrink-0', 'xl:shrink');
    expect(row).not.toHaveClass('h-full');
  });

  it('shows a dash rather than a blank for an unclassified row', async () => {
    mockFetch();
    renderTopics();

    const row = (await screen.findByText('Export to CSV is missing columns')).closest('tr')!;

    // Three taxonomy columns, all empty in the payload.
    expect(within(row).getAllByText('—')).toHaveLength(3);
  });

  it('says how much of the book is classified when some of it is not', async () => {
    mockFetch({ ...stats, classified: 600 });
    renderTopics();

    // Three taxonomy charts, each carrying the same note.
    const notes = await screen.findAllByText(/600 of 981 classified/);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toHaveTextContent('381 not yet counted here');
  });

  it('says nothing about classification when everything is classified', async () => {
    mockFetch();
    renderTopics();

    await screen.findByText('Expansion Discovery Call');
    expect(screen.queryByText(/classified/)).not.toBeInTheDocument();
  });

  // ── the filter bar ────────────────────────────────────────────────

  it('offers the real filter options rather than a hardcoded list', async () => {
    mockFetch();
    renderTopics();

    const sentiment = await screen.findByLabelText('Sentiment');
    expect(within(sentiment).getByRole('option', { name: 'Positive' })).toBeInTheDocument();
    expect(within(sentiment).getByRole('option', { name: 'Negative' })).toBeInTheDocument();

    const brackets = screen.getByLabelText('Revenue Bracket');
    expect(within(brackets).getByRole('option', { name: 'Under $25K' })).toBeInTheDocument();
  });

  it('refetches with a query string when a filter changes', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderTopics();

    await screen.findByLabelText('Sentiment');
    await user.selectOptions(screen.getByLabelText('Sentiment'), 'negative');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('sentiment=negative'));
  });

  it('sends the right param for an organisation and for an account', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderTopics();

    await screen.findByLabelText('Account Name');
    await user.selectOptions(screen.getByLabelText('Account Name'), 'customer:7');
    await waitFor(() => expect(lastUrl(fetchMock)).toContain('customer=7'));

    await user.selectOptions(screen.getByLabelText('Account Name'), 'account:2');
    await waitFor(() => expect(lastUrl(fetchMock)).toContain('account=2'));
  });

  it('sends the Account Name scope as customer or account', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
    vi.stubGlobal('fetch', fetchMock);
    renderTopics('/dashboard/support/topics?scope=account:4&sentiment=negative');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('account=4');
    expect(url).toContain('sentiment=negative');
  });

  it('narrows the subcategory options to the chosen category', async () => {
    mockFetch();
    const user = userEvent.setup();
    renderTopics();

    await screen.findByLabelText('AI Category');
    await user.selectOptions(screen.getByLabelText('AI Category'), 'bug_report');

    const subcategory = screen.getByLabelText('AI Subcategory');
    expect(within(subcategory).getByRole('option', { name: 'UI Bug' })).toBeInTheDocument();
    expect(
      within(subcategory).queryByRole('option', { name: 'Setup Assistance' })
    ).not.toBeInTheDocument();
  });

  it('clears a subcategory that no longer belongs to the chosen category', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderTopics();

    await screen.findByLabelText('AI Subcategory');
    await user.selectOptions(screen.getByLabelText('AI Subcategory'), 'ui_bug');
    await waitFor(() => expect(lastUrl(fetchMock)).toContain('subcategory=ui_bug'));

    // Picking a category the subcategory doesn't belong to would otherwise send
    // a self-contradicting pair and empty every chart for no visible reason.
    await user.selectOptions(screen.getByLabelText('AI Category'), 'onboarding');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('category=onboarding'));
    expect(lastUrl(fetchMock)).not.toContain('subcategory=');
  });

  it('keeps a valid deep-linked category+subcategory through the first fetch and after options load', async () => {
    // Before the stats response lands, `options` (and so `subcategories`) is
    // undefined — there is no way yet to know whether the URL's subcategory
    // belongs to the URL's category, so a good deep link must not be judged
    // invalid and thrown away before it gets the chance to be confirmed.
    const fetchMock = mockFetch();
    renderTopics('/dashboard/support/topics?category=bug_report&subcategory=ui_bug');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('subcategory=ui_bug');

    await screen.findByLabelText('AI Subcategory');
    await waitFor(() =>
      expect(screen.getByLabelText('AI Subcategory')).toHaveValue('ui_bug')
    );

    // Confirmed valid once options load — it never drops out afterwards.
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('subcategory=ui_bug');
    }
  });

  it('drops a deep-linked subcategory that turns out to belong to a different category, once options load', async () => {
    // ui_bug belongs to bug_report, not onboarding, in this fixture. Before
    // options load that can't be known, so the very first fetch is allowed to
    // still carry the URL's value through unfiltered; once the stats response
    // proves it stale, the URL is cleaned up and nothing fetched afterwards
    // may carry it.
    const fetchMock = mockFetch();
    renderTopics('/dashboard/support/topics?category=onboarding&subcategory=ui_bug');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('subcategory=ui_bug');

    await screen.findByLabelText('AI Subcategory');
    await waitFor(() =>
      expect(screen.getByLabelText('AI Subcategory')).toHaveValue('')
    );

    const afterLoad = fetchMock.mock.calls.slice(1);
    expect(afterLoad.length).toBeGreaterThan(0);
    for (const call of afterLoad) {
      expect(String(call[0])).not.toContain('subcategory=');
    }
  });

  it('counts the active filters and clears them all', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderTopics();

    await screen.findByLabelText('Sentiment');
    await user.selectOptions(screen.getByLabelText('Sentiment'), 'negative');
    await user.selectOptions(screen.getByLabelText('Activity Type'), 'call');

    await user.click(await screen.findByRole('button', { name: 'Clear 2' }));

    await waitFor(() => expect(lastUrl(fetchMock)).toMatch(/\/interactions\/stats\/$/));
  });

  // ── failure and empty states ──────────────────────────────────────

  it('surfaces a failed fetch rather than rendering empty charts silently', async () => {
    mockFetch({ detail: 'Server exploded' }, 500);
    renderTopics();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Server exploded|Could not load/);
  });

  it('says so when nothing matches the filters', async () => {
    mockFetch({
      ...stats,
      total: 0,
      classified: 0,
      by_type: [],
      sentiment: [],
      areas: [],
      categories: [],
      subcategories: [],
      sentiment_timeline: [],
      recent: [],
    });
    renderTopics();

    expect(
      await screen.findByText('No emails, calls or tickets match these filters.')
    ).toBeInTheDocument();
    expect(screen.getByText('No activity matches these filters.')).toBeInTheDocument();
    expect(screen.getByText('No activity in this period.')).toBeInTheDocument();
  });

  it('keeps the previous numbers on screen when a refetch fails', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderTopics();

    await screen.findByText('Expansion Discovery Call');

    // A filter change that 500s shouldn't blank a dashboard that was showing
    // real numbers a moment ago.
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Nope' }) })
    );
    await user.selectOptions(screen.getByLabelText('Sentiment'), 'negative');

    await screen.findByRole('alert');
    expect(screen.getByText('Expansion Discovery Call')).toBeInTheDocument();
  });
});

// ── drill (server) ──────────────────────────────────────────────────

describe('AI Trending Topics drill', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('drills into the Call slice of the activity-type donut', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'type:call': drillResponse(
        [{ id: 2, name: 'Apple EMEA', owner: 'Carl CSM', arr: 240_000, value: 182 }],
        'interactions',
      ),
    });
    const user = userEvent.setup();
    renderTopics();

    await user.click(await screen.findByRole('button', { name: 'Call 182, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/interactions/stats/?drill=type%3Acall')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Apple EMEA' })).toBeInTheDocument();
    expect(within(dialog).getByText('182 interactions')).toBeInTheDocument();
  });

  it('carries the current filters into a drill request', async () => {
    const fetchMock = mockFetchRouted(stats, { 'type:call': drillResponse([], 'interactions') });
    const user = userEvent.setup();
    renderTopics('/dashboard/support/topics?sentiment=negative');

    await user.click(await screen.findByRole('button', { name: 'Call 182, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain(
        '/api/v1/interactions/stats/?sentiment=negative&drill=type%3Acall'
      )
    );
  });

  it('drills into the Negative slice of the sentiment donut', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'sentiment:negative': drillResponse(
        [{ id: 2, name: 'Apple EMEA', owner: 'Carl CSM', arr: 240_000, value: 157 }],
        'interactions',
      ),
    });
    const user = userEvent.setup();
    renderTopics();

    await user.click(await screen.findByRole('button', { name: 'Negative 157, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/interactions/stats/?drill=sentiment%3Anegative')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Apple EMEA' })).toBeInTheDocument();
  });

  it('drills into the Customer Success slice of the AI area donut', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'area:customer_success': drillResponse(
        [{ id: 2, name: 'Apple EMEA', owner: 'Carl CSM', arr: 240_000, value: 265 }],
        'interactions',
      ),
    });
    const user = userEvent.setup();
    renderTopics();

    await user.click(
      await screen.findByRole('button', { name: 'Customer Success 265, show accounts' })
    );

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain('/api/v1/interactions/stats/?drill=area%3Acustomer_success')
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Apple EMEA' })).toBeInTheDocument();
  });

  it('drills into an AI category bar', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'category:account_management': drillResponse(
        [{ id: 2, name: 'Apple EMEA', owner: 'Carl CSM', arr: 240_000, value: 235 }],
        'interactions',
      ),
    });
    const user = userEvent.setup();
    renderTopics();

    await user.click(
      await screen.findByRole('button', { name: 'Account Management 235, show accounts' })
    );

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain(
        '/api/v1/interactions/stats/?drill=category%3Aaccount_management'
      )
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Apple EMEA' })).toBeInTheDocument();
  });

  it('drills into an AI subcategory bar', async () => {
    const fetchMock = mockFetchRouted(stats, {
      'subcategory:user_access': drillResponse(
        [{ id: 2, name: 'Apple EMEA', owner: 'Carl CSM', arr: 240_000, value: 165 }],
        'interactions',
      ),
    });
    const user = userEvent.setup();
    renderTopics();

    await user.click(await screen.findByRole('button', { name: 'User Access 165, show accounts' }));

    await waitFor(() =>
      expect(lastUrl(fetchMock)).toContain(
        '/api/v1/interactions/stats/?drill=subcategory%3Auser_access'
      )
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Apple EMEA' })).toBeInTheDocument();
  });
});

describe('chartTheme', () => {
  it('niceMax rounds up past the data rather than clipping it', () => {
    // The mock's own `domain={[0, 150]}` silently cut anything taller.
    expect(niceMax([142, 65, 31])).toBe(200);
    // A single-digit peak is already a clean axis maximum, so it stays put.
    expect(niceMax([4, 7])).toBe(7);
  });

  it('niceMax falls back rather than returning zero for an empty chart', () => {
    expect(niceMax([])).toBe(10);
    expect(niceMax([0, 0])).toBe(10);
  });

  it('percentOf says 0 rather than NaN for an empty total', () => {
    expect(percentOf(0, 0)).toBe('0');
    expect(percentOf(157, 981)).toBe('16');
  });

  it('compact leaves counts under a thousand alone', () => {
    // The mock divided unconditionally, so 300 rendered as the longer "0.3K".
    expect(compact(300)).toBe('300');
    expect(compact(2090)).toBe('2.09K');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider, useSelector } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import interactionsReducer from '../../../../../features/interactions/interactionsSlice';
import type { InteractionStats } from '../../../../../features/interactions/interactionsSlice';
import { ActivityDetailedTable } from './ActivityDetailedTable';

const row = {
  id: 'ticket:12',
  source: 'Ticket',
  account: 'Oracle',
  title: 'Slow page load for large accounts',
  sentiment: 'Neutral',
  area: 'Support & Operations',
  category: 'Integration Support',
  subcategory: 'Webhook Failure',
  keys: { sentiment: 'neutral', area: 'support_operations', category: 'integration_support', subcategory: 'webhook_failure' },
  corrected: false,
  occurred_on: '2026-09-01',
};

const stats = {
  total: 1, classified: 1, by_type: [], sentiment: [], areas: [], categories: [], subcategories: [], sentiment_timeline: [],
  recent: [row],
  filters: {
    customers: [], accounts: [], types: [], revenue_brackets: [],
    sentiments: [{ value: 'neutral', name: 'Neutral' }, { value: 'negative', name: 'Negative' }],
    areas: [{ value: 'support_operations', name: 'Support & Operations' }, { value: 'product_growth', name: 'Product & Growth' }],
    categories: [{ value: 'integration_support', name: 'Integration Support' }, { value: 'bug_report', name: 'Bug Report' }],
    subcategories: [
      { value: 'webhook_failure', name: 'Webhook Failure', category: 'integration_support' },
      { value: 'performance_issue', name: 'Performance Issue', category: 'bug_report' },
      { value: 'ui_bug', name: 'UI Bug', category: 'bug_report' },
    ],
  },
} as unknown as InteractionStats;

function mockApi(status = 200) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: async () =>
        status < 400
          ? {
              id: 'ticket:12',
              keys: { sentiment: 'neutral', area: 'product_growth', category: 'bug_report', subcategory: 'performance_issue' },
              labels: { area: 'Product & Growth', category: 'Bug Report', subcategory: 'Performance Issue', sentiment: 'Neutral' },
              corrected: true,
              feedback: { id: 1 },
            }
          : { detail: "'made_up' is not a subcategory the taxonomy has." },
    })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderTable() {
  const store = configureStore({
    reducer: { interactions: interactionsReducer },
    preloadedState: { interactions: { stats, isLoading: false, error: null } },
  });
  // The real page hands the table the store's rows, so an in-place update
  // reaches it; a static array would not.
  function FromStore() {
    const rows = useSelector((s: { interactions: { stats: InteractionStats | null } }) => s.interactions.stats?.recent ?? []);
    return <ActivityDetailedTable rows={rows} />;
  }
  render(
    <Provider store={store}>
      <FromStore />
    </Provider>
  );
  return store;
}

describe('ActivityDetailedTable sentiment pill', () => {
  beforeEach(() => vi.unstubAllGlobals());

  // Neutral used to render in amber (bg-warning), the same treatment as a
  // caution — but a neutral interaction is not a concern, so it shouldn't
  // draw the eye the way Negative does. Positive stays success, Negative
  // stays danger.
  it('renders Neutral muted rather than amber', () => {
    renderTable();
    const tableRow = screen.getByText('Slow page load for large accounts').closest('tr')!;
    const pill = within(tableRow).getByText('Neutral');
    expect(pill.className).not.toMatch(/bg-warning/);
    expect(pill.className).toContain('bg-subtle');
    expect(pill.className).toContain('text-ink-muted');
  });
});

describe('ActivityDetailedTable scrolling', () => {
  beforeEach(() => vi.unstubAllGlobals());

  // The reference pattern for every dashboard table: it scrolls inside its
  // card with the header pinned, and a keyboard can reach the scroll region.
  it('scrolls inside its card at 480px with the header pinned', () => {
    renderTable();
    const region = screen.getByRole('region', { name: 'Detailed activity breakdown' });
    expect(region).toHaveStyle({ maxHeight: '480px' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.className).toContain('[&_thead_th]:sticky');
    expect(within(region).getByRole('columnheader', { name: 'Account Name' })).toBeInTheDocument();
  });

  it('keeps a shortened account name whole on hover', () => {
    renderTable();
    expect(screen.getByText('Oracle')).toHaveAttribute('title', 'Oracle');
  });
});

describe('ActivityDetailedTable corrections', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('lets a person correct the tags, offering subcategories only under the chosen category', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    const store = renderTable();

    await user.click(screen.getByRole('button', { name: 'Correct Slow page load for large accounts' }));
    await user.selectOptions(screen.getByLabelText('AI area for Slow page load for large accounts'), 'product_growth');
    await user.selectOptions(screen.getByLabelText('AI category for Slow page load for large accounts'), 'bug_report');
    const sub = screen.getByLabelText('AI subcategory for Slow page load for large accounts') as HTMLSelectElement;
    expect([...sub.options].map((o) => o.value)).toEqual(['', 'performance_issue', 'ui_bug']);
    await user.selectOptions(sub, 'performance_issue');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/interactions/ticket/12/classification/');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({
      area: 'product_growth', category: 'bug_report', subcategory: 'performance_issue', note: '',
    });
    // The row updates in place, and says it was corrected.
    await waitFor(() => expect(screen.getByText('Performance Issue')).toBeInTheDocument());
    expect(screen.getByText('corrected')).toBeInTheDocument();
    expect(store.getState().interactions.stats?.recent[0].corrected).toBe(true);
  });

  it('sends nothing when nothing changed', async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole('button', { name: 'Correct Slow page load for large accounts' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Correct Slow page load for large accounts' })).toBeInTheDocument();
  });

  it('shows the backend refusal and stays in edit', async () => {
    mockApi(400);
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole('button', { name: 'Correct Slow page load for large accounts' }));
    await user.selectOptions(screen.getByLabelText('Sentiment for Slow page load for large accounts'), 'negative');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a subcategory|Could not save/);
    expect(within(screen.getByRole('alert').closest('tr') as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

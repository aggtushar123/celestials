import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import productsReducer from '../../../../features/products/productsSlice';
import { AreaLayout } from '../../AreaLayout';
import { ProductUsageContainer } from '../ProductUsageContainer';
import { ControlsView } from './ControlsView';

// Integration tier: container + view + charts through the real router, with
// only the fetch boundary mocked. The two Recharts charts need a sized
// container jsdom won't give them, so they're asserted on through their own
// headline and footnote text; the tiles and the scorecard table are plain DOM.

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  product: 'Product A',
  customers: 4,
  arr: 443_600,
  share: 64.4,
  unpriced: 0,
  utilisation: 75.1,
  contracted_seats: 1040,
  active_seats: 781,
  health: { good: 4, average: 0, poor: 0 },
  healthy_share: 100.0,
  unhealthy_arr: 0,
  ces: 84.5,
  nps: 57.5,
  open_tickets: 33,
  tickets_per_customer: 8.2,
  churned: 0,
  churned_arr: 0,
  churn_rate: 0.0,
  ...overrides,
});

const stats = {
  rows: [
    row(),
    row({
      id: 2,
      product: 'Product B',
      customers: 3,
      arr: 203_000,
      share: 29.5,
      utilisation: 31.0,
      health: { good: 0, average: 1, poor: 2 },
      healthy_share: 0.0,
      unhealthy_arr: 203_000,
      ces: 47.3,
      nps: -38.3,
      open_tickets: 25,
      tickets_per_customer: 8.3,
      churned: 1,
      churned_arr: 24_000,
      churn_rate: 25.0,
    }),
    row({
      id: 3,
      product: 'Integrations Module',
      customers: 1,
      arr: 0,
      share: 0,
      utilisation: null,
      contracted_seats: 0,
      active_seats: 0,
      health: { good: 1, average: 0, poor: 0 },
      healthy_share: 100.0,
      unhealthy_arr: 0,
      ces: null,
      nps: null,
      open_tickets: 6,
      tickets_per_customer: 6.0,
      churned: 1,
      churned_arr: 152_600,
      churn_rate: 50.0,
    }),
  ],
  kpis: {
    products: 3,
    customers: 8,
    arr: 646_600,
    largest: { product: 'Product A', share: 64.4, arr: 443_600 },
    weakest: {
      product: 'Product B',
      unhealthy_arr: 203_000,
      healthy_share: 0.0,
      customers: 3,
      healthy: 0,
    },
    worst_churn: { product: 'Integrations Module', churned: 1, churned_arr: 152_600 },
    without_customers: [],
  },
  attribution: {
    basis: 'primary_product',
    note: 'Every figure counts customers whose *primary* product this is.',
  },
  currency: 'USD' as const,
  filters: {
    products: [
      { value: '1', name: 'Product A' },
      { value: 'none', name: 'No product recorded' },
    ],
    owners: [{ value: '5', name: 'Carl CSM' }],
    lifecycles: [{ value: 'live', name: 'Live' }],
  },
};

function mockFetch(body: unknown = stats, status = 200) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() =>
    Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderProductUsage(url = '/dashboard/revenue/products') {
  const store = configureStore({ reducer: { products: productsReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/dashboard/revenue" element={<AreaLayout area="revenue" />}>
            <Route element={<ProductUsageContainer />}>
              <Route path="products" element={<ControlsView />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

const lastUrl = (spy: ReturnType<typeof mockFetch>) =>
  spy.mock.calls[spy.mock.calls.length - 1][0];

// getByText would be ambiguous for "Products": the sub-view switch in the
// bar reads the same word as the KPI tile it sits above.
const tile = (label: string) =>
  screen.getAllByText(label).find((el) => el.tagName !== 'A')!.parentElement as HTMLElement;

const productRow = (name: string) =>
  screen.getByRole('cell', { name: new RegExp(`^${name}`) }).closest('tr') as HTMLElement;

describe('Product Usage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches product usage on mount', async () => {
    const fetchMock = mockFetch();
    renderProductUsage();

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('/customers/products/'));
  });

  it('states the attribution limit above the numbers, not under them', async () => {
    // The one thing a reader must not miss: these are customers *led by* a
    // product, and a customer on three products is counted once.
    mockFetch();
    renderProductUsage();

    expect(await screen.findByText(/How to read this:/)).toBeInTheDocument();
    expect(
      screen.getByText(/this is not revenue split across products/)
    ).toBeInTheDocument();
  });

  it('leads with how many products carry how much', async () => {
    mockFetch();
    renderProductUsage();

    await screen.findAllByText('Products');
    expect(within(tile('Products')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Products')).getByText('8 customers · $646.6K led')).toBeInTheDocument();
  });

  it('names the largest product by the share of the book it leads', async () => {
    mockFetch();
    renderProductUsage();

    await screen.findByText('Largest');
    expect(within(tile('Largest')).getByText('64.4%')).toBeInTheDocument();
    expect(within(tile('Largest')).getByText('Product A · $443.6K')).toBeInTheDocument();
  });

  it('ranks the weakest product on money at stake, not on a percentage', async () => {
    mockFetch();
    renderProductUsage();

    await screen.findByText('Most at stake');
    const card = tile('Most at stake');
    expect(within(card).getByText('$203.0K')).toBeInTheDocument();
    expect(within(card).getByText('Product B · 0 of 3 healthy')).toBeInTheDocument();
  });

  it('says so plainly when no product is in trouble', async () => {
    mockFetch({ ...stats, kpis: { ...stats.kpis, weakest: null, worst_churn: null } });
    renderProductUsage();

    await screen.findByText('Most at stake');
    expect(
      within(tile('Most at stake')).getByText('every product is in good health')
    ).toBeInTheDocument();
    expect(within(tile('Worst churn')).getByText('no churn on any product')).toBeInTheDocument();
  });

  it('reports worst churn by the ARR that left', async () => {
    mockFetch();
    renderProductUsage();

    await screen.findByText('Worst churn');
    expect(within(tile('Worst churn')).getByText('$152.6K')).toBeInTheDocument();
    expect(
      within(tile('Worst churn')).getByText('Integrations Module · 1 left')
    ).toBeInTheDocument();
  });

  // ── the comparison table ──────────────────────────────────────────

  it('puts every product on a row with its own measures', async () => {
    mockFetch();
    renderProductUsage();

    await screen.findByText('Product by product');
    const card = productRow('Product B');
    expect(within(card).getByText('31%')).toBeInTheDocument();
    expect(within(card).getByText('47.3')).toBeInTheDocument();
    expect(within(card).getByText('-38.3')).toBeInTheDocument();
    expect(within(card).getByText('0/3')).toBeInTheDocument();
  });

  it('prints a dash for a product nobody surveyed rather than a zero', async () => {
    // Zero would rank it below a product customers actively dislike.
    mockFetch();
    renderProductUsage();

    await screen.findByText('Product by product');
    const card = productRow('Integrations Module');
    expect(within(card).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(within(card).getByText('no seats recorded')).toBeInTheDocument();
  });

  it('flags a product with no customers left', async () => {
    mockFetch({
      ...stats,
      rows: [
        row({
          id: 9,
          product: 'Dead Product',
          customers: 0,
          arr: 0,
          healthy_share: null,
          churned: 2,
          churned_arr: 90_000,
          churn_rate: 100.0,
        }),
      ],
    });
    renderProductUsage();

    await screen.findByText('Product by product');
    expect(within(productRow('Dead Product')).getByText('nobody left')).toBeInTheDocument();
  });

  it('names the products nobody in this selection is on', async () => {
    // Only sayable because products are rows: a free-text field has no entry
    // for a product with no customers. Deliberately not "unsold" — the rows
    // are the whole catalogue, the customers are the caller's own book.
    mockFetch({
      ...stats,
      kpis: { ...stats.kpis, without_customers: ['Product D', 'Pilot Add-on'] },
    });
    renderProductUsage();

    expect(
      await screen.findByText('Nobody in this selection is on Product D, Pilot Add-on.')
    ).toBeInTheDocument();
  });

  it('stays quiet when every product has somebody on it', async () => {
    mockFetch();
    renderProductUsage();

    await screen.findByText('Product by product');
    expect(screen.queryByText(/Nobody in this selection/)).not.toBeInTheDocument();
  });

  it('tells a product that lost everyone apart from one nobody is on', async () => {
    mockFetch({
      ...stats,
      rows: [
        row({ id: 9, product: 'Dead Product', customers: 0, arr: 0, churned: 2 }),
        row({ id: 10, product: 'Never Sold', customers: 0, arr: 0, churned: 0 }),
      ],
    });
    renderProductUsage();

    await screen.findByText('Product by product');
    expect(within(productRow('Dead Product')).getByText('nobody left')).toBeInTheDocument();
    expect(within(productRow('Never Sold')).getByText('nobody on it')).toBeInTheDocument();
  });

  it('names customers left out of the money figures', async () => {
    mockFetch({ ...stats, rows: [row({ unpriced: 2 })] });
    renderProductUsage();

    expect(
      await screen.findByText(/2 customers counted in every seat and health figure/)
    ).toBeInTheDocument();
  });

  // ── the charts ────────────────────────────────────────────────────

  it('splits each product’s ARR by the health of the accounts holding it', async () => {
    mockFetch();
    renderProductUsage();

    expect(await screen.findByText('ARR by product')).toBeInTheDocument();
    expect(screen.getByText(/split by the health of the accounts holding it/)).toBeInTheDocument();
  });

  it('charts churn by money and leaves the clean products out', async () => {
    mockFetch();
    renderProductUsage();

    expect(await screen.findByText('Churn by product')).toBeInTheDocument();
    expect(
      screen.getByText('1 product here has never lost a customer and is not charted.')
    ).toBeInTheDocument();
  });

  it('says so when nothing has churned at all', async () => {
    mockFetch({ ...stats, rows: [row()] });
    renderProductUsage();

    expect(
      await screen.findByText('No customers in this selection have churned.')
    ).toBeInTheDocument();
  });

  it('reports an empty selection rather than drawing empty charts', async () => {
    mockFetch({
      ...stats,
      rows: [],
      kpis: {
        ...stats.kpis,
        products: 0,
        customers: 0,
        arr: 0,
        largest: null,
        weakest: null,
        worst_churn: null,
      },
    });
    renderProductUsage();

    expect(
      await screen.findByText(/No products on this organisation's list yet/)
    ).toBeInTheDocument();
    expect(screen.getByText('No products match these filters.')).toBeInTheDocument();
  });

  // ── the bar ───────────────────────────────────────────────────────

  it('leads the filter bar with Product, the axis of the screen', async () => {
    mockFetch();
    renderProductUsage();

    const products = await screen.findByLabelText('Product');
    expect(within(products).getByRole('option', { name: 'Product A' })).toBeInTheDocument();
    // Built from the book, so "no product recorded" can be filtered to as well.
    expect(
      within(products).getByRole('option', { name: 'No product recorded' })
    ).toBeInTheDocument();
  });

  it('refetches with a query string when a filter changes', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderProductUsage();

    await screen.findByLabelText('Product');
    await user.selectOptions(screen.getByLabelText('Product'), '1');

    await waitFor(() => expect(lastUrl(fetchMock)).toContain('product=1'));
  });

  it('clears the filters', async () => {
    const fetchMock = mockFetch();
    const user = userEvent.setup();
    renderProductUsage();

    await screen.findByLabelText('Primary Owner');
    await user.selectOptions(screen.getByLabelText('Primary Owner'), '5');
    await user.click(await screen.findByRole('button', { name: 'Clear 1' }));

    await waitFor(() => expect(lastUrl(fetchMock)).toMatch(/\/customers\/products\/$/));
  });

  it('sends the URL filters to the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => stats });
    vi.stubGlobal('fetch', fetchMock);
    renderProductUsage('/dashboard/revenue/products?product=1&owner=5');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('product=1');
    expect(url).toContain('owner=5');
  });

  it('surfaces a failed fetch', async () => {
    mockFetch({ detail: 'Server exploded' }, 500);
    renderProductUsage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Server exploded|Could not load/);
  });
});

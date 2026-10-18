import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { healthRow, renderWithHealth, renderWithDrill } from './testUtils';
import { RenewalView } from './RenewalView';

// Integration tier. The two Recharts charts need a sized container jsdom won't
// give them, so they're asserted on by their headings and their own summary
// text; the owner bars and the work list are plain DOM and are asserted
// directly. The money maths is pinned to fixtures in renewal.test.ts.

/** A row renewing `days` from today, so the fixtures move with the clock the
 *  component reads rather than being pinned to a date that goes stale. */
function renewingIn(days: number, overrides: Parameters<typeof healthRow>[0] = {}) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return healthRow({
    renewalDate: date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    ...overrides,
  });
}

const BOOK = [
  renewingIn(12, {
    id: '1',
    account: 'Nova Enterprises',
    owner: 'Gerry Hill',
    ownerKey: 'gerry',
    arr: 240_000,
    healthStatus: 'Poor',
    daysSinceTouch: 95,
    // Poor health + no contact in 95 days, as the backend's rule scores it.
    riskOfLoss: 0.6,
    riskFactors: [
      { label: 'Poor health', points: 0.5 },
      { label: 'No contact in 95 days', points: 0.1 },
    ],
  }),
  renewingIn(45, {
    id: '2',
    account: 'Hyatt Hotels',
    owner: 'Ada Lovelace',
    ownerKey: 'ada',
    arr: 120_000,
    healthStatus: 'Good',
    daysSinceTouch: 4,
    riskOfLoss: 0.05,
    riskFactors: [{ label: 'Good health', points: 0.05 }],
  }),
  renewingIn(200, {
    id: '3',
    account: 'Far Future Co',
    owner: 'Ada Lovelace',
    ownerKey: 'ada',
    arr: 600_000,
    healthStatus: 'Average',
    daysSinceTouch: 20,
    riskOfLoss: 0.25,
    riskFactors: [{ label: 'Average health', points: 0.25 }],
  }),
];

/** The stat tile carrying `label`, so a number that legitimately appears twice
 *  is still asserted against the right card. */
const tile = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe('RenewalView', () => {
  it('leads with the money renewing in the next 90 days, not the whole book', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    // 240k + 120k. The 600k renewing in 200 days is real revenue but it is not
    // this quarter's problem, and rolling it in makes the window meaningless.
    expect(within(tile('Up for renewal')).getByText('$360.0K')).toBeInTheDocument();
    expect(within(tile('Up for renewal')).getByText(/2 accounts/)).toBeInTheDocument();
  });

  it('shows forecast exposure as less than the window it came from', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    // Poor + cold is 0.6 of 240k, Good is 0.05 of 120k — $150K, not $360K.
    // A tab that called the whole window "at risk" would be ignored by week two.
    expect(within(tile('Forecast at risk')).getByText('$150.0K')).toBeInTheDocument();
  });

  it('calls out renewing money with nobody talking to it', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    const card = tile('No recent contact');
    expect(within(card).getByText('$240.0K')).toBeInTheDocument();
    expect(within(card).getByText(/1 renewing with nothing logged in 60 days/)).toBeInTheDocument();
  });

  it('reports overdue renewals separately from the window', () => {
    renderWithHealth(<RenewalView />, {
      rows: [...BOOK, renewingIn(-9, { id: '4', account: 'Slipped Ltd', arr: 80_000 })],
    });

    expect(within(tile('Past due')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Past due')).getByText(/\$80\.0K past its renewal date/)).toBeInTheDocument();
    // Money past its renewal date is a loss, coloured the same as every other
    // loss figure on this tab.
    expect(within(tile('Past due')).getByText('1').className).toContain('text-danger');
    // Still $360K: an overdue renewal is not "due now".
    expect(within(tile('Up for renewal')).getByText('$360.0K')).toBeInTheDocument();
  });

  it('says so when every renewal date is still ahead', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    expect(within(tile('Past due')).getByText(/every renewal date is still ahead/)).toBeInTheDocument();
    // Nothing overdue: back to plain ink, not a false alarm.
    expect(within(tile('Past due')).getByText('0').className).toContain('text-ink');
  });

  it('names what it cannot speak for rather than quietly dropping it', () => {
    renderWithHealth(<RenewalView />, {
      rows: [...BOOK, healthRow({ id: '5', renewalDate: '' })],
      unconvertedCount: 2,
    });

    expect(screen.getByText(/1 with no renewal date recorded/)).toBeInTheDocument();
    expect(screen.getByText(/2 excluded from money totals/)).toBeInTheDocument();
  });

  it('ranks the work list by expected loss rather than by contract size', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(within(rows[0]).getByText('Nova Enterprises')).toBeInTheDocument();
    // And it shows why it ranked that way.
    expect(within(rows[0]).getByText(/Poor health · No contact in 95 days/)).toBeInTheDocument();
  });

  it('keeps the work list to the accounts that renew soon', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    expect(screen.queryByText('Far Future Co')).not.toBeInTheDocument();
  });

  it('shows an unpriced renewal as a dash rather than as nothing at stake', () => {
    renderWithHealth(<RenewalView />, {
      rows: [renewingIn(10, { id: '9', account: 'Unpriced Co', arr: null })],
    });

    const row = screen.getByText('Unpriced Co').closest('tr')!;
    expect(within(row).getAllByText('—')).toHaveLength(2); // ARR and exposure
  });

  it('shows each owner their renewal load', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    // Ada's book is $120K here, not $720K: her other renewal is 200 days out,
    // past the two-quarter horizon this chart is a staffing decision for. Her
    // name also appears in the work list, so this asserts on the bar's own
    // label rather than on the text.
    expect(
      screen.getByRole('button', { name: /Ada Lovelace \$120\.0K, show accounts/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Gerry Hill \$240\.0K, show accounts/ })
    ).toBeInTheDocument();
  });

  it('draws the calendar and the coverage gap', () => {
    renderWithHealth(<RenewalView />, { rows: BOOK });

    expect(screen.getByText('Renewal calendar')).toBeInTheDocument();
    expect(screen.getByText('Coverage gap')).toBeInTheDocument();
    // The coverage chart's own headline: only the 240k inside 90 days counts,
    // not the 600k account that is also stale but far out.
    expect(screen.getByText(/\$240\.0K renewing in 90 days with no recent contact/)).toBeInTheDocument();
  });

  it('does not count an overdue renewal as "renewing in 90 days"', () => {
    // Caught on screen: the coverage headline read $69.6K while the tile
    // beside it, reading the same book, read $0 — the difference was one
    // overdue account being counted as if it were still ahead.
    renderWithHealth(<RenewalView />, {
      rows: [renewingIn(-40, { id: '7', account: 'Slipped Ltd', arr: 70_000, daysSinceTouch: 200 })],
    });

    // Asserted on the tile's own sentence rather than on "$0": Intl renders a
    // compact zero as "$0.0" under Node's ICU and "$0" under Chrome's, and the
    // claim being tested is about the count, not the formatter.
    expect(
      within(tile('No recent contact')).getByText(/0 renewing with nothing logged in 60 days/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/renewing in 90 days with no recent contact/)).not.toBeInTheDocument();
  });

  it('says the book is empty rather than drawing empty charts', () => {
    renderWithHealth(<RenewalView />, { rows: [] });

    expect(screen.queryByText('Renewal calendar')).not.toBeInTheDocument();
  });

  it('surfaces a failed load', () => {
    renderWithHealth(<RenewalView />, { rows: [], error: 'Could not load account health.' });

    expect(screen.getByText('Could not load account health.')).toBeInTheDocument();
  });

  // Reachability as a tab (not a filter chip) is now the shared sub-view
  // nav's job — `DashboardToolbar`, fed by `AREAS` in `areas.ts` — which has
  // its own tests; the container no longer renders a tab bar of its own for
  // this suite to reach through.
});

describe('RenewalView drill', () => {
  const drillBook = [
    // Up for renewal, forecast at risk (priced), fresh contact.
    renewingIn(10, {
      id: '1',
      account: 'PricedSoon',
      arr: 100_000,
      daysSinceTouch: 2,
      riskOfLoss: 0.4,
    }),
    // Up for renewal, but unpriced — not in "forecast at risk".
    renewingIn(20, { id: '2', account: 'UnpricedSoon', arr: null, daysSinceTouch: 2 }),
    // Up for renewal and cold — behind "No recent contact" too.
    renewingIn(30, { id: '3', account: 'ColdSoon', arr: 50_000, daysSinceTouch: 90 }),
    // Near miss: renews well beyond the 90-day horizon.
    renewingIn(200, { id: '4', account: 'FarOut', arr: 900_000 }),
    // Overdue — behind "Past due", not "Up for renewal".
    renewingIn(-9, { id: '5', account: 'SlippedLtd', arr: 80_000 }),
  ];

  it('Up for renewal opens exactly the accounts inside the 90-day horizon', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalView />, { rows: drillBook });

    await user.click(screen.getByRole('button', { name: /Up for renewal \$150\.0K, show accounts/ }));
    const dialog = screen.getByRole('dialog');

    ['PricedSoon', 'UnpricedSoon', 'ColdSoon'].forEach((name) =>
      expect(within(dialog).getByRole('link', { name })).toBeInTheDocument(),
    );
    ['FarOut', 'SlippedLtd'].forEach((name) =>
      expect(within(dialog).queryByRole('link', { name })).not.toBeInTheDocument(),
    );
  });

  it('Forecast at risk opens only the priced accounts, with their risk and weighted exposure as the detail', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalView />, { rows: drillBook });

    await user.click(screen.getByRole('button', { name: /Forecast at risk/ }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'PricedSoon' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'ColdSoon' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'UnpricedSoon' })).not.toBeInTheDocument();

    // PricedSoon: $100K x 40% risk = $40.0K at risk. ColdSoon: $50K x the
    // default 5% risk = $2.5K. Each row's own weighted figure, not just the
    // percentage, so the rows visibly add up to the tile's $42.5K.
    const pricedRow = within(dialog).getByRole('link', { name: 'PricedSoon' }).closest('li') as HTMLElement;
    expect(pricedRow).toHaveTextContent('40% risk · $40.0K at risk');
    const coldRow = within(dialog).getByRole('link', { name: 'ColdSoon' }).closest('li') as HTMLElement;
    expect(coldRow).toHaveTextContent('5% risk · $2.5K at risk');
  });

  it('Forecast at risk: each row\'s weighted exposure sums (within rounding) to the tile\'s own figure', async () => {
    const user = userEvent.setup();
    const twoAccounts = [
      renewingIn(10, { id: '1', account: 'BigRisk', arr: 200_000, riskOfLoss: 0.3 }),
      renewingIn(20, { id: '2', account: 'SmallRisk', arr: 100_000, riskOfLoss: 0.1 }),
    ];
    renderWithDrill(<RenewalView />, { rows: twoAccounts });

    // 200_000 x 0.3 + 100_000 x 0.1 = 60_000 + 10_000 = $70.0K.
    await user.click(screen.getByRole('button', { name: /Forecast at risk \$70\.0K, show accounts/ }));
    const dialog = screen.getByRole('dialog');

    const bigRow = within(dialog).getByRole('link', { name: 'BigRisk' }).closest('li') as HTMLElement;
    const smallRow = within(dialog).getByRole('link', { name: 'SmallRisk' }).closest('li') as HTMLElement;
    expect(bigRow).toHaveTextContent('30% risk · $60.0K at risk');
    expect(smallRow).toHaveTextContent('10% risk · $10.0K at risk');
  });

  it('No recent contact opens only the accounts with nothing logged in 60 days', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalView />, { rows: drillBook });

    await user.click(screen.getByRole('button', { name: /No recent contact/ }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'ColdSoon' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'PricedSoon' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'UnpricedSoon' })).not.toBeInTheDocument();
  });

  it('Past due opens the overdue accounts, each with how many days overdue', async () => {
    const user = userEvent.setup();
    renderWithDrill(<RenewalView />, { rows: drillBook });

    await user.click(screen.getByRole('button', { name: /Past due 1, show accounts/ }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'SlippedLtd' })).toBeInTheDocument();
    ['PricedSoon', 'UnpricedSoon', 'ColdSoon', 'FarOut'].forEach((name) =>
      expect(within(dialog).queryByRole('link', { name })).not.toBeInTheDocument(),
    );
    const slippedRow = within(dialog).getByRole('link', { name: 'SlippedLtd' }).closest('li') as HTMLElement;
    expect(slippedRow).toHaveTextContent('9 days overdue');
  });

  it('offers no drill on any tile or chart when the book is truncated', () => {
    renderWithDrill(<RenewalView />, { rows: drillBook, truncated: true });

    expect(screen.queryByRole('button', { name: /Up for renewal/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Forecast at risk/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /No recent contact/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Past due/ })).not.toBeInTheDocument();
    // The renewal calendar's per-segment keyboard targets, gone too.
    expect(screen.queryByRole('button', { name: /show accounts/ })).not.toBeInTheDocument();
  });
});

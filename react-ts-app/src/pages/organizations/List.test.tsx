import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderList } from './testList';
import { LONG_PRESS_MS } from '../../components/organizations/portfolio/AccountRow';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { resetViewport } from '../../test/viewport';
import {
  ALL_ROWS,
  buildPortfolio,
  bulkBodies,
  customerFixture,
  portfolioQueries,
  stubPortfolio,
} from '../../features/organizations/testPortfolio';

// Integration tier: the real page, store and router; fetch stubbed with
// §2-shaped bodies (features/organizations/testPortfolio.ts).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const { createObjectURL, revokeObjectURL } = URL;

/** Wraps the stub so matching requests wait until `release()`, once `start()`ed. */
function holdFetch(spy: ReturnType<typeof stubPortfolio>, when: (url: URL) => boolean) {
  const waiting: (() => void)[] = [];
  let on = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (on && when(new URL(String(input)))) await new Promise<void>((resolve) => waiting.push(resolve));
    return spy(input, init);
  });
  return {
    start: () => {
      on = true;
    },
    release: () => {
      on = false;
      waiting.splice(0).forEach((resolve) => resolve());
    },
  };
}
const isPortfolio = (url: URL) => url.pathname.endsWith('/organizations/portfolio/');

describe('Organizations list (portfolio)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetViewport();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  it('loads tiles, health sections and rows from the portfolio endpoint', async () => {
    const spy = stubPortfolio();
    renderList();
    expect(await screen.findByRole('button', { name: /^Average · 1/ })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(screen.getByRole('group', { name: 'Health' })).toBeInTheDocument();
    const [frame] = portfolioQueries(spy);
    expect(frame.get('group')).toBe('health');
    expect(frame.get('sort')).toBe('-arr');
    expect(frame.get('limit')).toBe('1');
    expect(portfolioQueries(spy).some((q) => q.get('group_value') === 'average' && q.get('limit') === '25')).toBe(true);
    expect(screen.getByText('2 organizations')).toBeInTheDocument();
  });

  it('lands a dashboard drill as a chip; removing it drops ids and returns focus to Search', async () => {
    const spy = stubPortfolio();
    renderList('/organizations/list?ids=7,2');
    const chip = await screen.findByRole('button', { name: 'Remove filter: Opened from the dashboard (2)' });
    expect(portfolioQueries(spy)[0].get('ids')).toBe('7,2');
    await userEvent.click(chip);
    expect(where().searchParams.has('ids')).toBe(false);
    expect(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' })).toHaveFocus();
  });

  it('filters from a tile, shows N of M, and clears the selection when filters change', async () => {
    stubPortfolio();
    renderList();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');

    await userEvent.click(screen.getByRole('button', { name: 'Average 1' }));
    expect(where().searchParams.get('health')).toBe('average');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument();
  });

  it('shows the designed empty state and clears filters from it', async () => {
    stubPortfolio();
    renderList('/organizations/list?search=zzz');
    expect(await screen.findByText('No organizations match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(where().searchParams.has('search')).toBe(false);
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('says the tiles and count are unavailable after a failed first load, not loading forever', async () => {
    stubPortfolio({ portfolio: () => ({ status: 500, body: { detail: 'Boom' } }) });
    renderList();
    expect(await screen.findByText('Summary unavailable')).toBeInTheDocument();
    expect(screen.getByText('Organizations unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading summary' })).not.toBeInTheDocument();
  });

  it('shows an error and recovers on Try again', async () => {
    let fail = true;
    stubPortfolio({ portfolio: (q) => (fail ? { status: 500, body: { detail: 'Boom' } } : buildPortfolio(q)) });
    renderList();
    expect(await screen.findByText(/Boom/)).toBeInTheDocument();
    expect(screen.getByText(/Boom/).closest('[role="alert"]')).not.toBeNull();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toBeInTheDocument();
  });

  it('exports the current query through the session', async () => {
    const spy = stubPortfolio();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderList('/organizations/list?health=average');
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const call = spy.mock.calls.find(([input]) => String(input).includes('export.csv'));
    expect(new URL(String(call?.[0])).searchParams.get('health')).toBe('average');
  });

  it('opens a row inline and edits it with the existing form', async () => {
    stubPortfolio({ customer: customerFixture });
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('button', { name: 'Close Pizza Hut' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(await screen.findByRole('heading', { name: 'Edit Pizza Hut' })).toBeInTheDocument();
  });

  it('adds an organization with the existing form', async () => {
    stubPortfolio();
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Add organization' }));
    expect(screen.getByRole('heading', { name: 'Add Organization' })).toBeInTheDocument();
  });

  it('moves focus to Search after removing any chip, not only the dashboard one', async () => {
    stubPortfolio();
    renderList('/organizations/list?health=average');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove filter: Health: Average' }));
    expect(where().searchParams.has('health')).toBe(false);
    expect(screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' })).toHaveFocus();
  });

  it('opens a row inline on desktop without a sheet', async () => {
    stubPortfolio();
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-panel="commercial"]')).toHaveLength(1);
  });

  it('ungrouped, keeps selected rows that are still listed after a filter change', async () => {
    stubPortfolio();
    renderList('/organizations/list?group=none');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex' }));
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('2 selected');
    await userEvent.click(screen.getByRole('button', { name: 'Average 1' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');
    expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).toBeChecked();
  });

  it('ungrouped, keeps failed ids selected across the reload after a bulk action, even from page 3', { timeout: 30000 }, async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ ...ALL_ROWS[1], id: 100 + i, name: `Account ${100 + i}` }));
    const spy = stubPortfolio({
      portfolio: (q) => buildPortfolio(q, rows),
      bulk: (body) => ({ updated: body.ids.slice(2), failed: body.ids.slice(0, 2).map((id) => ({ id, reason: 'Not found.' })) }),
    });
    renderList('/organizations/list?group=none');
    await screen.findByRole('link', { name: 'Account 100' });
    await userEvent.click(screen.getByRole('button', { name: 'Show more organizations' }));
    await screen.findByRole('link', { name: 'Account 150' });
    await userEvent.click(screen.getByRole('button', { name: 'Show more organizations' }));
    await screen.findByRole('link', { name: 'Account 219' });
    for (let id = 200; id < 210; id += 1) await userEvent.click(screen.getByRole('checkbox', { name: `Select Account ${id}` }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(bar).toHaveTextContent('10 selected');
    const before = portfolioQueries(spy).length;
    await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Set lifecycle' }), 'live');
    await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 10' }));
    await waitFor(() => expect(bulkBodies(spy)).toHaveLength(1));
    expect(await within(bar).findByText(/1 failed|2 failed/)).toBeInTheDocument();
    // The reload lands page one only; the two failures are on page 3.
    await waitFor(() => expect(portfolioQueries(spy).length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Account 200' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Account 100' })).not.toBeDisabled());
    expect(bar).toHaveTextContent('2 selected');
  });

  it('keeps the selection when the group changes to None, pruning against the flat rows, and clears it back to Health', async () => {
    stubPortfolio();
    renderList();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'none');
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Average · 1/ })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Globex' })).not.toBeDisabled());
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('2 selected');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'name');
    await waitFor(() => expect(where().searchParams.get('sort')).toBe('-name'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Globex' })).not.toBeDisabled());
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('2 selected');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'health');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument());
  });

  it('ungrouped, clears the selection when the query changed while a bulk action ran', async () => {
    const spy = stubPortfolio();
    const gate = holdFetch(spy, (url) => url.pathname.endsWith('/organizations/bulk/'));
    renderList('/organizations/list?group=none');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex' }));
    gate.start();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Set lifecycle' }), 'live');
    await userEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Average 1' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());
    gate.release();
    const bar = await screen.findByRole('region', { name: 'Selection' });
    expect(await within(bar).findByText(/Updated 2 organizations/)).toBeInTheDocument();
    expect(bar).not.toHaveTextContent('selected');
    expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).not.toBeChecked();
  });

  it('disables selection and bulk actions while the list reloads', async () => {
    const spy = stubPortfolio();
    const gate = holdFetch(spy, isPortfolio);
    renderList();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
    gate.start();
    await userEvent.click(screen.getByRole('button', { name: 'Good 1' }));
    const bar = screen.getByRole('region', { name: 'Selection' });
    expect(within(bar).getByRole('combobox', { name: 'Change owner' })).toBeDisabled();
    expect(within(bar).getByRole('button', { name: /Export/ })).toBeDisabled();
    expect(bar).not.toHaveTextContent('Applying…');
    gate.release();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument());
  });

  it('grouped, keeps checkboxes disabled until the frame lands, even once a section has', async () => {
    const spy = stubPortfolio();
    const gate = holdFetch(spy, (url) => isPortfolio(url) && url.searchParams.has('group') && !url.searchParams.has('group_value'));
    renderList();
    await screen.findByRole('checkbox', { name: 'Select Pizza Hut' });
    gate.start();
    await userEvent.click(screen.getByRole('button', { name: 'Average 1' }));
    await waitFor(() =>
      expect(portfolioQueries(spy).some((q) => q.get('health') === 'average' && q.get('group_value') === 'average')).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole('link', { name: 'Pizza Hut' }).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false'));
    expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).toBeDisabled();
    gate.release();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).not.toBeDisabled());
  });

  it('keeps the open sheet in step with reloaded rows', async () => {
    let rows = ALL_ROWS;
    stubPortfolio({ portfolio: (q) => buildPortfolio(q, rows), customer: customerFixture });
    renderList('/organizations/list', { width: 375 });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Pizza Hut' })).getByRole('button', { name: 'Edit details' }));
    await screen.findByRole('heading', { name: 'Edit Pizza Hut' });
    rows = ALL_ROWS.map((row) => (row.id === 7 ? { ...row, name: 'Pizza Hut Ltd' } : row));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('dialog', { name: 'Pizza Hut Ltd' })).toBeInTheDocument();
  });

  describe('bulk actions', () => {
    it('unassigns with value null, lists failures by name, keeps them selected and reloads', async () => {
      const spy = stubPortfolio({
        bulk: (body) => ({ updated: body.ids.filter((id) => id !== 7), failed: [{ id: 7, reason: 'Not found.' }] }),
      });
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex' }));
      const before = portfolioQueries(spy).length;
      const bar = screen.getByRole('region', { name: 'Selection' });
      await userEvent.selectOptions(within(bar).getByRole('combobox', { name: 'Change owner' }), 'unassigned');
      expect(bulkBodies(spy)).toHaveLength(0);
      await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 2' }));
      await waitFor(() => expect(bulkBodies(spy)).toHaveLength(1));
      expect(bulkBodies(spy)[0]).toEqual({ ids: [7, 1], action: 'set_owner', value: null });
      expect(await within(bar).findByText(/Updated 1 organization\./)).toBeInTheDocument();
      expect(within(bar).getByText('Pizza Hut').closest('li')).toHaveTextContent('Pizza Hut: Not found.');
      await waitFor(() => expect(portfolioQueries(spy).length).toBeGreaterThan(before));
      await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).not.toBeDisabled());
      expect(bar).toHaveTextContent('1 selected');
      expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Select Globex' })).not.toBeChecked();
    });

    it('offers every active member and every stage but churn as targets, not just the ones in use', async () => {
      const spy = stubPortfolio({
        members: [
          { id: 9, name: 'Nora New', is_active: true },
          { id: 4, name: 'Gone Away', is_active: false },
        ],
      });
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      const bar = screen.getByRole('region', { name: 'Selection' });
      const owner = within(bar).getByRole('combobox', { name: 'Change owner' });
      // Nora owns nothing, so the filter options never name her.
      expect(await within(owner).findByRole('option', { name: 'Nora New' })).toBeInTheDocument();
      expect(within(owner).getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
      expect(within(owner).queryByRole('option', { name: 'Gone Away' })).not.toBeInTheDocument();
      expect(within(owner).queryByRole('option', { name: 'Carl CSM' })).not.toBeInTheDocument();
      const stage = within(bar).getByRole('combobox', { name: 'Set lifecycle' });
      // No account is in Expansion.
      expect(within(stage).getByRole('option', { name: 'Expansion' })).toBeInTheDocument();
      expect(within(stage).queryByRole('option', { name: 'Churn' })).not.toBeInTheDocument();

      await userEvent.selectOptions(owner, '9');
      await userEvent.click(within(bar).getByRole('button', { name: 'Apply to 1' }));
      await waitFor(() => expect(bulkBodies(spy)).toEqual([{ ids: [7], action: 'set_owner', value: 9 }]));
    });

    it('archives after a confirm and names the account the server refused', async () => {
      const spy = stubPortfolio({
        bulk: (body) => ({ updated: [], failed: body.ids.map((id) => ({ id, reason: "You can't archive this organization." })) }),
      });
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      await userEvent.click(within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Archive' }));
      expect(screen.getByRole('heading', { name: 'Archive Pizza Hut?' })).toBeInTheDocument();
      const buttons = screen.getAllByRole('button', { name: 'Archive' });
      await userEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => expect(bulkBodies(spy)).toEqual([{ ids: [7], action: 'archive', value: null }]));
      expect(await screen.findByText(/You can't archive this organization\./)).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('Pizza Hut: You can\'t archive this organization.');
    });

    it('does not reselect failures when the filters changed while the action ran', async () => {
      const spy = stubPortfolio({ bulk: (body) => ({ updated: [], failed: body.ids.map((id) => ({ id, reason: 'Not found.' })) }) });
      const gate = holdFetch(spy, (url) => url.pathname.endsWith('/organizations/bulk/'));
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      gate.start();
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Change owner' }), 'unassigned');
      await userEvent.click(screen.getByRole('button', { name: 'Apply to 1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Good 1' }));
      await waitFor(() => expect(screen.queryByRole('link', { name: 'Pizza Hut' })).not.toBeInTheDocument());
      await screen.findByRole('link', { name: 'Globex' });
      gate.release();
      const bar = await screen.findByRole('region', { name: 'Selection' });
      expect(await within(bar).findByText(/1 failed/)).toBeInTheDocument();
      expect(bar).not.toHaveTextContent('selected');
    });

    it('guards Export (selected) against a double click', async () => {
      const spy = stubPortfolio();
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const gate = holdFetch(spy, (url) => url.pathname.endsWith('export.csv'));
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      gate.start();
      const bar = screen.getByRole('region', { name: 'Selection' });
      await userEvent.click(within(bar).getByRole('button', { name: 'Export' }));
      expect(within(bar).getByRole('button', { name: 'Export' })).toBeDisabled();
      expect(bar).toHaveTextContent('Exporting…');
      expect(bar).not.toHaveTextContent('Applying…');
      await userEvent.click(within(bar).getByRole('button', { name: 'Export' }));
      gate.release();
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      expect(spy.mock.calls.filter(([input]) => String(input).includes('export.csv'))).toHaveLength(1);
    });

    it('keeps the selection when a churn is cancelled, and clears it once churned', async () => {
      const spy = stubPortfolio({ customer: customerFixture });
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      const bar = screen.getByRole('region', { name: 'Selection' });
      await userEvent.click(within(bar).getByRole('button', { name: 'Churn' }));
      const before = portfolioQueries(spy).length;
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('heading', { name: 'Churn Pizza Hut?' })).not.toBeInTheDocument();
      expect(bar).toHaveTextContent('1 selected');
      expect(portfolioQueries(spy)).toHaveLength(before);

      await userEvent.click(within(bar).getByRole('button', { name: 'Churn' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm Churn' }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument());
      await waitFor(() => expect(portfolioQueries(spy).length).toBeGreaterThan(before));
    });

    it('offers churn only for exactly one account, in the existing churn modal', async () => {
      stubPortfolio();
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex' }));
      const bar = screen.getByRole('region', { name: 'Selection' });
      expect(within(bar).queryByRole('button', { name: 'Churn' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Globex' }));
      await userEvent.click(within(bar).getByRole('button', { name: 'Churn' }));
      expect(screen.getByRole('heading', { name: 'Churn Pizza Hut?' })).toBeInTheDocument();
    });

    it('exports the selected accounts, churned included', async () => {
      const spy = stubPortfolio();
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      renderList();
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pizza Hut' }));
      await userEvent.click(within(screen.getByRole('region', { name: 'Selection' })).getByRole('button', { name: 'Export' }));
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
      const call = spy.mock.calls.find(([input]) => String(input).includes('export.csv'));
      const query = new URL(String(call?.[0])).searchParams;
      expect(query.get('ids')).toBe('7');
      expect(query.get('include_churned')).toBe('1');
    });
  });

  it('shows the export failing', async () => {
    const spy = stubPortfolio();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('export.csv')
        ? { ok: false, status: 500, json: async () => ({ detail: 'Export broke' }) }
        : spy(input, init),
    );
    renderList();
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect((await screen.findByText('Export broke')).closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled();
  });

  describe('on a phone (375px)', () => {
    it('collapses the toolbar and keeps group, sort, export and add in the Filters sheet', async () => {
      stubPortfolio();
      renderList('/organizations/list', { width: 375 });
      await screen.findByRole('link', { name: 'Pizza Hut' });
      expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
      const sheet = screen.getByRole('dialog', { name: 'Filters' });
      expect(sheet).toHaveAttribute('aria-modal', 'true');
      for (const name of ['Group', 'Sort by']) expect(within(sheet).getByRole('combobox', { name })).toBeInTheDocument();
      expect(within(sheet).getByRole('button', { name: 'Add organization' })).toBeInTheDocument();
      expect(within(sheet).getByRole('checkbox', { name: 'Include churned' })).toBeInTheDocument();
    });

    it('enters selection mode from a visible Select toggle, without a long press', async () => {
      stubPortfolio();
      renderList('/organizations/list', { width: 375 });
      await screen.findByRole('link', { name: 'Pizza Hut' });
      const toggle = screen.getByRole('button', { name: 'Select' });
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('checkbox', { name: 'Select Pizza Hut' }).closest('label')).not.toHaveClass('hidden');
      await userEvent.click(document.querySelector('[data-row-id="7"] [data-part="header"]') as HTMLElement);
      expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');
      expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument();
    });

    it('shows the Select toggle pressed after a long press, and turning it off ends selection', async () => {
      stubPortfolio();
      renderList('/organizations/list', { width: 375 });
      await screen.findByRole('link', { name: 'Pizza Hut' });
      const header = document.querySelector('[data-row-id="7"] [data-part="header"]') as HTMLElement;
      fireEvent.pointerDown(header);
      await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 50));
      fireEvent.pointerUp(header);
      const toggle = screen.getByRole('button', { name: 'Select' });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('region', { name: 'Selection' })).not.toBeInTheDocument();
    });

    it('opens a row as a bottom sheet, and Escape closes it', async () => {
      stubPortfolio();
      renderList('/organizations/list', { width: 375 });
      await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
      const sheet = screen.getByRole('dialog', { name: 'Pizza Hut' });
      expect(within(sheet).getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
      expect(document.querySelectorAll('[data-panel="commercial"]')).toHaveLength(1);
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    });
  });
});

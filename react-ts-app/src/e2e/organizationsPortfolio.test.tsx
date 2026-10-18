import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderList } from '../pages/organizations/testList';
import { LONG_PRESS_MS } from '../components/organizations/portfolio/AccountRow';
import { bulkBodies, portfolioQueries, stubPortfolio } from '../features/organizations/testPortfolio';
import { resetViewport } from '../test/viewport';
import { resetMembersCache } from '../features/knowledge/useMembers';

// End-to-end tier (jsdom, no browser): the real page, store, router and
// every portfolio component. Only fetch is stubbed, with §2-shaped bodies.
// Setting lifecycle fails for Globex (id 1) with the backend's own reason.

describe('Organizations portfolio', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('filters, opens a row, pins a field, selects and bulk-edits, reporting failures per account', { timeout: 30000 }, async () => {
    const spy = stubPortfolio({
      members: [
        { id: 2, name: 'Carl CSM', is_active: true },
        { id: 3, name: 'Priya', is_active: true },
      ],
      bulk: (body) =>
        body.action === 'set_lifecycle'
          ? { updated: body.ids.filter((id) => id !== 1), failed: body.ids.includes(1) ? [{ id: 1, reason: 'Not found.' }] : [] }
          : { updated: body.ids, failed: [] },
    });
    renderList();
    expect(await screen.findByRole('link', { name: 'Globex' })).toBeInTheDocument();

    // 1. Filter: owner Carl CSM, from the Filters popover.
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Owner' }), '2');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('1 of 2 organizations')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Owner: Carl CSM' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());

    // 2. Open Pizza Hut inline: its panels show.
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    const details = document.getElementById('account-7-details') as HTMLElement;
    expect(within(details).getByText('Detractor')).toBeInTheDocument();
    expect(within(details).getByText('$140,000.00')).toBeInTheDocument();

    // 3. Pin NPS: it shows on the row and is remembered for this user.
    await userEvent.click(screen.getByRole('button', { name: 'Pin fields' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'NPS' }));
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('[data-row-id="7"] [data-pin="nps"]')).toHaveTextContent('NPS −80');
    expect(localStorage.getItem('revenact.organizations.pins.1')).toBe('["nps"]');

    // 4. Select Pizza Hut.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza Hut' }));
    expect(screen.getByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');

    // 5. Bulk: choose Priya, then Apply. The list reloads.
    const before = portfolioQueries(spy).length;
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Change owner' }), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Apply to 1' }));
    await waitFor(() => expect(bulkBodies(spy)).toEqual([{ ids: [7], action: 'set_owner', value: 3 }]));
    expect(await screen.findByText('Updated 1 organization.')).toBeInTheDocument();
    await waitFor(() => expect(portfolioQueries(spy).length).toBeGreaterThan(before));

    // 6. Clear the filter (the selection clears with it), select both, set a
    //    lifecycle: Globex fails by name and stays selected for a retry.
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Owner: Carl CSM' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Globex' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza Hut' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Set lifecycle' }), 'live');
    await userEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));
    await waitFor(() => expect(bulkBodies(spy).at(-1)).toEqual({ ids: [1, 7], action: 'set_lifecycle', value: 'live' }));
    const bar = await screen.findByRole('region', { name: 'Selection' });
    expect(await within(bar).findByText('Globex')).toBeInTheDocument();
    expect(bar).toHaveTextContent('Updated 1 organization. 1 failed:');
    expect(bar).toHaveTextContent('Globex: Not found.');
    expect(bar).toHaveTextContent('1 selected');
    expect(screen.getByRole('checkbox', { name: 'Select Globex' })).toBeChecked();
  });

  it('starts selection with a long press on a phone', { timeout: 15000 }, async () => {
    stubPortfolio();
    renderList('/organizations/list', { width: 375 });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    const header = document.querySelector('[data-row-id="7"] [data-part="header"]') as HTMLElement;
    fireEvent.pointerDown(header);
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 50));
    fireEvent.pointerUp(header);
    expect(await screen.findByRole('region', { name: 'Selection' })).toHaveTextContent('1 selected');
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });
});

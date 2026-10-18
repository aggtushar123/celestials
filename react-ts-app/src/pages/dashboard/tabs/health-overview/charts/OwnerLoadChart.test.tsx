import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithDrill, healthRow } from '../testUtils';
import { OwnerLoadChart } from './OwnerLoadChart';
import { ownerLoad, renewalRows } from '../renewal';

/** Local midnight, matching the other suites, so calendar-day maths is stable. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

describe('OwnerLoadChart drill', () => {
  it('opens exactly the accounts carried by the clicked owner', async () => {
    const ada = healthRow({ id: '1', account: 'AdaAcct', owner: 'Ada Lovelace', ownerKey: 'ada', renewalDate: 'Jul 1, 2026', arr: 120_000 });
    const gerry = healthRow({ id: '2', account: 'GerryAcct', owner: 'Gerry Hill', ownerKey: 'gerry', renewalDate: 'Jul 2, 2026', arr: 240_000 });
    const { rows } = renewalRows([ada, gerry], NOW);
    const load = ownerLoad(rows);

    const user = userEvent.setup();
    renderWithDrill(<OwnerLoadChart load={load} currency="USD" horizonDays={180} />);

    await user.click(screen.getByRole('button', { name: 'Ada Lovelace $120.0K, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'AdaAcct' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'GerryAcct' })).not.toBeInTheDocument();
  });

  it('keeps two owners with the same name as separate, individually drillable rows', async () => {
    const samOne = healthRow({ id: '1', account: 'SamOneAcct', owner: 'Sam Rivera', ownerKey: 'sam-1', renewalDate: 'Jul 1, 2026', arr: 200_000 });
    const samTwo = healthRow({ id: '2', account: 'SamTwoAcct', owner: 'Sam Rivera', ownerKey: 'sam-2', renewalDate: 'Jul 2, 2026', arr: 50_000 });
    const { rows } = renewalRows([samOne, samTwo], NOW);
    const load = ownerLoad(rows);

    const user = userEvent.setup();
    renderWithDrill(<OwnerLoadChart load={load} currency="USD" horizonDays={180} />);

    // Disambiguated by ownerKey since the display name alone collides.
    const bigSam = screen.getByRole('button', { name: 'Sam Rivera (sam-1) $200.0K, show accounts' });
    const smallSam = screen.getByRole('button', { name: 'Sam Rivera (sam-2) $50.0K, show accounts' });

    await user.click(bigSam);
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'SamOneAcct' })).toBeInTheDocument();

    await user.click(smallSam);
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'SamTwoAcct' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('link', { name: 'SamOneAcct' })).not.toBeInTheDocument();
  });

  it('renders nothing to click when nothing renews in the window', () => {
    renderWithDrill(<OwnerLoadChart load={[]} currency="USD" horizonDays={180} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing renews in this window/i)).toBeInTheDocument();
  });

  it('renders plain rows, not buttons, when told the book is not drillable', () => {
    const ada = healthRow({ id: '1', account: 'AdaAcct', owner: 'Ada Lovelace', ownerKey: 'ada', renewalDate: 'Jul 1, 2026', arr: 120_000 });
    const { rows } = renewalRows([ada], NOW);
    const load = ownerLoad(rows);

    renderWithDrill(<OwnerLoadChart load={load} currency="USD" horizonDays={180} drillable={false} />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('OwnerLoadChart legend', () => {
  it('keys the bar and its shaded expected loss', () => {
    const ada = healthRow({ id: '1', account: 'AdaAcct', owner: 'Ada Lovelace', ownerKey: 'ada', renewalDate: 'Jul 1, 2026', arr: 120_000 });
    const { rows } = renewalRows([ada], NOW);
    renderWithDrill(<OwnerLoadChart load={ownerLoad(rows)} currency="USD" horizonDays={180} />);
    const legend = screen.getByText('ARR renewing').closest('ul') as HTMLElement;
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'ARR renewing',
      'Expected loss',
    ]);
  });
});

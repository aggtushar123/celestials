import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithDrill, healthRow } from '../testUtils';
import { HealthByOwnerStackedBar } from './HealthByOwnerStackedBar';

describe('HealthByOwnerStackedBar drill', () => {
  it('opens exactly the accounts in one owner × health segment', async () => {
    const data = [
      healthRow({ id: '1', account: 'CarlPoor', owner: 'Carl CSM', ownerKey: 'carl', healthStatus: 'Poor' }),
      // Near miss: same owner, a different health status.
      healthRow({ id: '2', account: 'CarlGood', owner: 'Carl CSM', ownerKey: 'carl', healthStatus: 'Good' }),
      // Near miss: same health status, a different owner.
      healthRow({ id: '3', account: 'DianaPoor', owner: 'Diana CSM', ownerKey: 'diana', healthStatus: 'Poor' }),
    ];

    const user = userEvent.setup();
    renderWithDrill(<HealthByOwnerStackedBar data={data} />);

    await user.click(screen.getByRole('button', { name: 'Carl CSM · Poor 1, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'CarlPoor' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'CarlGood' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'DianaPoor' })).not.toBeInTheDocument();
  });

  it('keeps two owners with the same name as separate, individually drillable segments', async () => {
    const data = [
      healthRow({ id: '1', account: 'SamOneAcct', owner: 'Sam Rivera', ownerKey: 'sam-1', healthStatus: 'Poor' }),
      healthRow({ id: '2', account: 'SamTwoAcct', owner: 'Sam Rivera', ownerKey: 'sam-2', healthStatus: 'Poor' }),
    ];

    const user = userEvent.setup();
    renderWithDrill(<HealthByOwnerStackedBar data={data} />);

    await user.click(screen.getByRole('button', { name: 'Sam Rivera (sam-1) · Poor 1, show accounts' }));
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'SamOneAcct' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('link', { name: 'SamTwoAcct' })).not.toBeInTheDocument();
  });

  it('offers no target for an owner-status segment with no accounts', () => {
    const data = [healthRow({ id: '1', account: 'CarlPoor', owner: 'Carl CSM', ownerKey: 'carl', healthStatus: 'Poor' })];
    renderWithDrill(<HealthByOwnerStackedBar data={data} />);
    expect(screen.queryByRole('button', { name: /Carl CSM · Good/ })).not.toBeInTheDocument();
  });

  it('offers no DrillTargets at all when told the book is not drillable', () => {
    const data = [healthRow({ id: '1', account: 'CarlPoor', owner: 'Carl CSM', ownerKey: 'carl', healthStatus: 'Poor' })];
    renderWithDrill(<HealthByOwnerStackedBar data={data} drillable={false} />);
    expect(screen.queryByRole('button', { name: /Carl CSM/ })).not.toBeInTheDocument();
  });
});

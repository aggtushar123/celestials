import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithDrill, healthRow } from '../testUtils';
import { CSMPulseBar } from './CSMPulseBar';

describe('CSMPulseBar drill', () => {
  it('opens exactly the accounts in one score × health segment', async () => {
    const data = [
      healthRow({ id: '1', account: 'ThreeAverage', csmPulseScore: 3, healthStatus: 'Average' }),
      // Near miss: same score, a different health status.
      healthRow({ id: '2', account: 'ThreePoor', csmPulseScore: 3, healthStatus: 'Poor' }),
      // Near miss: same health status, a different score.
      healthRow({ id: '3', account: 'FourPoor', csmPulseScore: 4, healthStatus: 'Poor' }),
      // Unrated — belongs in no bucket at all.
      healthRow({ id: '4', account: 'Unrated', csmPulseScore: null, healthStatus: 'Average' }),
    ];

    const user = userEvent.setup();
    renderWithDrill(<CSMPulseBar data={data} />);

    await user.click(screen.getByRole('button', { name: 'CSM Pulse 3 · Average 1, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'ThreeAverage' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'ThreePoor' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'FourPoor' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Unrated' })).not.toBeInTheDocument();
  });

  it('offers no target for a score-status segment with no accounts', () => {
    const data = [healthRow({ id: '1', csmPulseScore: 3, healthStatus: 'Average' })];
    renderWithDrill(<CSMPulseBar data={data} />);
    expect(screen.queryByRole('button', { name: /CSM Pulse 5/ })).not.toBeInTheDocument();
  });

  it('offers no target at all when drillable is false (a truncated book)', () => {
    const data = [healthRow({ id: '1', csmPulseScore: 3, healthStatus: 'Average' })];
    renderWithDrill(<CSMPulseBar data={data} drillable={false} />);
    expect(screen.queryAllByRole('button', { name: /show accounts/ })).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithDrill, healthRow } from '../testUtils';
import { AIPulseBar } from './AIPulseBar';

describe('AIPulseBar drill', () => {
  it('opens exactly the accounts in one score × health segment', async () => {
    const data = [
      healthRow({ id: '1', account: 'TwoGood', aiPulseScore: 2, healthStatus: 'Good' }),
      // Near miss: same score, a different health status.
      healthRow({ id: '2', account: 'TwoPoor', aiPulseScore: 2, healthStatus: 'Poor' }),
      // Near miss: same health status, a different score.
      healthRow({ id: '3', account: 'FivePoor', aiPulseScore: 5, healthStatus: 'Poor' }),
      // Unrated — belongs in no bucket at all.
      healthRow({ id: '4', account: 'Unrated', aiPulseScore: null, healthStatus: 'Good' }),
    ];

    const user = userEvent.setup();
    renderWithDrill(<AIPulseBar data={data} />);

    await user.click(screen.getByRole('button', { name: 'AI Pulse 2 · Good 1, show accounts' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('link', { name: 'TwoGood' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'TwoPoor' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'FivePoor' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Unrated' })).not.toBeInTheDocument();
  });

  it('offers no target for a score-status segment with no accounts', () => {
    const data = [healthRow({ id: '1', aiPulseScore: 2, healthStatus: 'Good' })];
    renderWithDrill(<AIPulseBar data={data} />);
    expect(screen.queryByRole('button', { name: /AI Pulse 1/ })).not.toBeInTheDocument();
  });

  it('offers no target at all when drillable is false (a truncated book)', () => {
    const data = [healthRow({ id: '1', aiPulseScore: 2, healthStatus: 'Good' })];
    renderWithDrill(<AIPulseBar data={data} drillable={false} />);
    expect(screen.queryAllByRole('button', { name: /show accounts/ })).toHaveLength(0);
  });
});

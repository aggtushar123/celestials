import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from '../../../features/customers/customersSlice';
import { pizzaEmeaRecord } from '../../../features/accounts/testAccountPage';
import { pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountTiles } from './AccountTiles';

function renderTiles({ account = pizzaEmeaRecord as Account | null, accountError = null as string | null } = {}) {
  const onJump = vi.fn();
  render(<AccountTiles row={pizzaEmea} currency="USD" account={account} accountError={accountError} onJump={onJump} />);
  return onJump;
}

describe('AccountTiles (spec 2026-09-29 §2.3)', () => {
  it('shows the health score and its trend, ARR in the workspace currency, the runway and the pulse pair', () => {
    renderTiles();
    expect(within(screen.getByRole('button', { name: /^Health 4\.9, Average/ })).getByText('4.9')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Health falling from 6\.2 to 4\.9/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ARR $69.6K. Show commercial details' })).toBeInTheDocument();
    expect(screen.getByText('Annual, in USD')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^Renewal/ })).getByText('47d overdue')).toBeInTheDocument();
    expect(screen.getByText('9 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('AI 1 · CSM 3')).toBeInTheDocument();
    expect(screen.getByText(/pulses disagree/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Pulse history/ })).toBeInTheDocument();
  });

  it('ARR and Renewal jump to Commercial, Pulse to the voice of the customer', async () => {
    const onJump = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: /^ARR/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Renewal 47d overdue. Show the renewal timeline' }));
    await userEvent.click(screen.getByRole('button', { name: /^Pulse/ }));
    expect(onJump.mock.calls.map(([panel]) => panel)).toEqual(['commercial', 'commercial', 'voice']);
  });

  it('Health opens the account pulse, signal by signal', async () => {
    renderTiles();
    const health = screen.getByRole('button', { name: 'Health 4.9, Average. Show the account pulse' });
    expect(health).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(health);
    const pulse = screen.getByRole('region', { name: 'Account pulse' });
    expect(health).toHaveAttribute('aria-controls', pulse.id);
    expect(pulse).toHaveTextContent('Account pulse: At risk · 2.4 / 5');
    expect(within(pulse).getAllByRole('listitem')).toHaveLength(5);
    expect(within(pulse).getByText('AI pulse').closest('li')).toHaveTextContent('1.0/5 · Poor');
    expect(within(pulse).getByText('AI pulse').closest('li')).toHaveTextContent('High Risk');
    expect(within(pulse).getByText('CSM pulse').closest('li')).toHaveTextContent('3.0/5 · Average');
    expect(within(pulse).getByText('Open tickets').closest('li')).toHaveTextContent('No data');
    expect(pulse).toHaveTextContent('An account has no health rubric');
    await userEvent.click(screen.getByRole('button', { name: 'Health 4.9, Average. Hide the account pulse' }));
    expect(screen.queryByRole('region', { name: 'Account pulse' })).not.toBeInTheDocument();
  });

  it('shows the account pulse loading while the record reads', async () => {
    renderTiles({ account: null });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading the account pulse');
  });

  it('shows the read\'s failure in place of the pulse', async () => {
    renderTiles({ account: null, accountError: 'Try later.' });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(within(screen.getByRole('region', { name: 'Account pulse' })).getByRole('alert')).toHaveTextContent('Try later.');
  });

  it('is a snapping strip on phones', () => {
    renderTiles();
    expect(screen.getByRole('button', { name: /^ARR/ }).parentElement!.parentElement).toHaveClass('snap-x', 'snap-mandatory', 'overflow-x-auto');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import { AccountSidePanel } from './AccountSidePanel';

describe('AccountSidePanel', () => {
  it('shows the account, its signals and the six panels in one column, with Edit details', async () => {
    const onEdit = vi.fn();
    render(
      <MemoryRouter>
        <AccountSidePanel row={pizzaHut} currency="USD" onClose={vi.fn()} onEdit={onEdit} />
      </MemoryRouter>,
    );
    const panel = screen.getByRole('complementary', { name: 'Pizza Hut' });
    expect(panel).toHaveAttribute('id', 'board-account-details');
    expect(within(panel).getByText('Carl CSM · Live · Touched 33d ago')).toBeInTheDocument();
    expect(within(panel).getByText('$69.6K')).toBeInTheDocument();
    expect(within(panel).getByText('47d overdue')).toBeInTheDocument();
    expect(panel.querySelectorAll('[data-panel]')).toHaveLength(6);
    const grid = panel.querySelector('[data-panel="commercial"]')!.parentElement!;
    expect(grid).not.toHaveClass('md:grid-cols-2');
    expect(grid).not.toHaveClass('xl:grid-cols-3');
    expect(within(panel).getByRole('link', { name: 'Open organization page' })).toHaveAttribute('href', '/organizations/7');
    await userEvent.click(within(panel).getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledWith(7);
  });

  it('takes focus on open, closes on Escape, and hands focus back to the opener', async () => {
    const onClose = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>
            Open it
          </button>
          {open ? (
            <AccountSidePanel
              row={pizzaHut}
              currency="USD"
              onClose={() => {
                onClose();
                setOpen(false);
              }}
            />
          ) : null}
        </MemoryRouter>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    await userEvent.click(opener);
    expect(screen.getByRole('button', { name: 'Close details' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('shows fresh data when its row prop changes while open', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AccountSidePanel row={pizzaHut} currency="USD" onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Carl CSM · Live · Touched 33d ago')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <AccountSidePanel
          row={{ ...pizzaHut, arr: 120000, lifecycle: { value: 'renewal', label: 'Renewal' } }}
          currency="USD"
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Carl CSM · Renewal · Touched 33d ago')).toBeInTheDocument();
    expect(screen.getByText('$120.0K')).toBeInTheDocument();
  });

  it('closes from its Close button', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AccountSidePanel row={pizzaHut} currency="USD" onClose={onClose} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountSheet } from './AccountSheet';
import { pizzaHut } from '../../../features/organizations/testPortfolio';

describe('AccountSheet', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('opens as a modal sheet with the header signals and the panels', () => {
    render(
      <MemoryRouter>
        <AccountSheet row={pizzaHut} currency="USD" onClose={vi.fn()} onEdit={vi.fn()} />
      </MemoryRouter>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Pizza Hut' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(within(sheet).getByRole('button', { name: 'Close' })).toHaveFocus();
    expect(sheet).toHaveTextContent('AI 1 · CSM 3');
    expect(sheet).toHaveTextContent('47d overdue');
    expect(within(sheet).getByRole('heading', { name: 'Commercial' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Edit details' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open organization page' })).toHaveAttribute('href', '/organizations/7');
  });

  it('leaves Escape to a modal above it, or to a handler that already took it', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AccountSheet row={pizzaHut} currency="USD" onClose={onClose} />
        <div role="dialog" aria-label="Edit Pizza Hut">
          <input aria-label="Name" />
        </div>
      </MemoryRouter>,
    );
    const field = screen.getByRole('textbox', { name: 'Name' });
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    const close = within(screen.getByRole('dialog', { name: 'Pizza Hut' })).getByRole('button', { name: 'Close' });
    close.focus();
    const taken = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    taken.preventDefault();
    close.dispatchEvent(taken);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const onClose = vi.fn();
    function Page({ open }: { open: boolean }) {
      return (
        <MemoryRouter>
          <button type="button">Open Pizza Hut</button>
          {open ? <AccountSheet row={pizzaHut} currency="USD" onClose={onClose} /> : null}
        </MemoryRouter>
      );
    }
    const { rerender } = render(<Page open={false} />);
    screen.getByRole('button', { name: 'Open Pizza Hut' }).focus();
    rerender(<Page open />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    rerender(<Page open={false} />);
    expect(screen.getByRole('button', { name: 'Open Pizza Hut' })).toHaveFocus();
  });

  it('locks the body scroll while open and restores it on close', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(
      <MemoryRouter>
        <AccountSheet row={pizzaHut} currency="USD" onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does not move focus again when the caller rerenders with a new inline onClose', () => {
    function Page() {
      return (
        <MemoryRouter>
          {/* A fresh arrow function every render, as a real caller would pass. */}
          <AccountSheet row={pizzaHut} currency="USD" onClose={() => {}} onEdit={vi.fn()} />
        </MemoryRouter>
      );
    }
    const { rerender } = render(<Page />);
    const editButton = screen.getByRole('button', { name: 'Edit details' });
    editButton.focus();
    expect(editButton).toHaveFocus();
    rerender(<Page />);
    expect(editButton).toHaveFocus();
  });

  it('closes on a backdrop click', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <AccountSheet row={pizzaHut} currency="USD" onClose={onClose} />
      </MemoryRouter>,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('traps Tab inside the sheet', () => {
    render(
      <MemoryRouter>
        <AccountSheet row={pizzaHut} currency="USD" onClose={vi.fn()} onEdit={vi.fn()} />
      </MemoryRouter>,
    );
    const closeButton = screen.getByRole('button', { name: 'Close' });
    const lastFocusable = screen.getByRole('link', { name: 'Open organization page' });

    lastFocusable.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(lastFocusable).toHaveFocus();
  });
});

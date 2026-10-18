import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './Toast';
import { TOAST_MS, useToast } from './toastContext';

function Shout({ withUndo = false, onUndo = () => {} }: { withUndo?: boolean; onUndo?: () => void }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({ message: 'Saved', action: withUndo ? { label: 'Undo', onAction: onUndo } : undefined })}>
      Go
    </button>
  );
}

afterEach(() => vi.useRealTimers());

describe('Toast (settings production spec §5.4)', () => {
  it('announces its message politely and leaves after five seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <Shout />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('runs its action once and closes', async () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <Shout withUndo onUndo={onUndo} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('waits while its Undo has focus, and leaves five seconds after focus moves on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <Shout withUndo />
        <button type="button">Elsewhere</button>
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    act(() => {
      vi.advanceTimersByTime(TOAST_MS * 3);
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus());
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('waits while it is hovered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <Shout withUndo />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    const toast = screen.getByRole('status').firstElementChild as HTMLElement;
    fireEvent.pointerEnter(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS * 2);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    fireEvent.pointerLeave(toast);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('does nothing outside a provider', async () => {
    render(<Shout />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

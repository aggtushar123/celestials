import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDismiss, type DismissReason } from './useDismiss';

function Popup({ onDismiss, active = true }: { onDismiss: (reason: DismissReason) => void; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDismiss([ref, triggerRef], onDismiss, active);
  return (
    <>
      <button type="button" ref={triggerRef}>
        Trigger
      </button>
      <div ref={ref}>
        <button type="button">Inside</button>
      </div>
      <button type="button">Outside</button>
    </>
  );
}

describe('useDismiss', () => {
  it('dismisses on a pointer press outside every ref, with the reason', async () => {
    const onDismiss = vi.fn();
    render(<Popup onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Inside' }));
    await userEvent.click(screen.getByRole('button', { name: 'Trigger' }));
    expect(onDismiss).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }));
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('outside');
  });

  it('dismisses on Escape', async () => {
    const onDismiss = vi.fn();
    render(<Popup onDismiss={onDismiss} />);
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('escape');
  });

  it('listens only while active', async () => {
    const onDismiss = vi.fn();
    render(<Popup onDismiss={onDismiss} active={false} />);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WorkToast, type Toast } from './WorkToast';

const toastPart = () => document.querySelector('[data-part="work-toast"]') as HTMLElement;

/** The toast on its own, with a button that had focus before it, and a
 *  control to show the next toast (as the page does after another row). */
function Harness({ first, second, fallback }: { first: Toast; second?: Toast; fallback?: () => void }) {
  const [toast, setToast] = useState<Toast | null>(null);
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setToast(first)}>
        Show first
      </button>
      {second ? (
        <button type="button" onClick={() => setToast(second)}>
          Show second
        </button>
      ) : null}
      <WorkToast toast={toast} onClose={() => setToast(null)} fallbackFocus={fallback} />
    </MemoryRouter>
  );
}

describe('WorkToast (Decision 1)', () => {
  it('hands focus back to what had it before the toast took it, on Close', async () => {
    render(<Harness first={{ id: 1, text: 'Done: Call Pizza Hut.', focus: true }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show first' }));
    expect(screen.getByText('Done: Call Pizza Hut.')).toHaveFocus();
    await userEvent.click(within(toastPart()).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Show first' })).toHaveFocus();
    expect(toastPart()).toBeEmptyDOMElement();
  });

  it('falls back when nothing outside the toast had focus', async () => {
    const fallback = vi.fn();
    render(<Harness first={{ id: 1, text: 'Added: Call the florist.', focus: false }} fallback={fallback} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show first' }));
    await userEvent.click(within(toastPart()).getByRole('button', { name: 'Close' }));
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('gives a newer toast a usable Undo while an older one is still undoing', async () => {
    let finish = () => {};
    const slow = () => new Promise<void>((resolve) => (finish = resolve));
    const quick = vi.fn(async () => {});
    render(<Harness first={{ id: 1, text: 'Done: A.', focus: true, undo: slow }} second={{ id: 2, text: 'Done: B.', focus: true, undo: quick }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show first' }));
    await userEvent.click(within(toastPart()).getByRole('button', { name: 'Undo' }));
    expect(within(toastPart()).getByRole('button', { name: 'Undoing…' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Show second' }));
    const undo = within(toastPart()).getByRole('button', { name: 'Undo' });
    expect(undo).not.toHaveAttribute('aria-disabled');
    finish();
    await userEvent.click(undo);
    expect(quick).toHaveBeenCalledTimes(1);
  });
});

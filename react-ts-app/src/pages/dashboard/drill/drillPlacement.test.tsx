import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard } from '../ask/testAsk';
import { useDrill } from './useDrill';

// Where the drill panel sits inside DashboardFrame's row (content column,
// Ask rail). jsdom does no layout, so these assert the placement the classes
// declare: over the rail's own box when the rail shows, in the rail's place
// in the row (so the content column narrows) when it does not.

function Opener() {
  const { open } = useDrill();
  return (
    <>
      <button
        type="button"
        onClick={(event) =>
          open({ title: 'At risk', figure: '$80.1K', source: { kind: 'rows', rows: [{ id: '3', name: 'Uber', arr: 42000 }] } }, event.currentTarget)
        }
      >
        At risk $80.1K
      </button>
      <p>Revenue figures</p>
    </>
  );
}

/** The frame's row: the element holding the content column, rail and panel. */
function frameRow() {
  return screen.getByText('Revenue figures').closest('.flex.gap-3') as HTMLElement;
}

describe('drill panel placement', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubCopilot();
  });
  afterEach(() => resetViewport());

  it('with the rail open (xl default), covers exactly the rail: 320px, same top, right and bottom', async () => {
    renderDashboard('/dashboard/revenue/forecast', () => <Opener />, 1440);
    expect(screen.getByRole('button', { name: 'Hide Copilot' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));

    const dialog = screen.getByRole('dialog', { name: /At risk/ });
    expect(dialog).toHaveAttribute('data-placement', 'rail');
    expect(dialog).toHaveClass('lg:absolute', 'lg:top-0', 'lg:right-4', 'lg:bottom-4', 'lg:w-[320px]');
    expect(dialog.className).not.toMatch(/360px/);
    // The row's own box is what the rail and the panel are measured from.
    expect(dialog.parentElement).toBe(frameRow());
    expect(frameRow()).toHaveClass('relative', 'px-4', 'pb-4');
  });

  it('with the rail collapsed (lg below xl), takes the rail\'s place in the row so the figures narrow', async () => {
    renderDashboard('/dashboard/revenue/forecast', () => <Opener />, 1100);
    expect(screen.getByRole('button', { name: 'Show Copilot' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));

    const dialog = screen.getByRole('dialog', { name: /At risk/ });
    expect(dialog).toHaveAttribute('data-placement', 'column');
    expect(dialog).toHaveClass('lg:static', 'lg:shrink-0', 'lg:w-[320px]');
    expect(dialog).not.toHaveClass('lg:absolute');
    // A flex item of the same row as the content column: it reserves its width.
    expect(dialog.parentElement).toBe(frameRow());

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Closed: nothing but the content column is left in the row.
    expect(frameRow().children).toHaveLength(1);
  });

  it('with the rail hidden by the switch, reserves the space too', async () => {
    renderDashboard('/dashboard/revenue/forecast', () => <Opener />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));

    expect(screen.getByRole('dialog', { name: /At risk/ })).toHaveAttribute('data-placement', 'column');
  });

  // The panel slides in from translateX(100%), outside the row, and the
  // frame's <main> is overflow-hidden: a plain focus() would scroll it
  // sideways to reveal the Close button and leave the figures shifted.
  it('moves focus into the panel without scrolling the page sideways', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderDashboard('/dashboard/revenue/forecast', () => <Opener />, 1100);
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));

    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    const call = focus.mock.calls[focus.mock.instances.indexOf(close)];
    expect(call).toEqual([{ preventScroll: true }]);
    focus.mockRestore();
  });

  it('below lg, stays a full-screen sheet', async () => {
    renderDashboard('/dashboard/revenue/forecast', () => <Opener />, 800);
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));

    const dialog = screen.getByRole('dialog', { name: /At risk/ });
    expect(dialog).toHaveAttribute('data-placement', 'sheet');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveClass('fixed', 'inset-0');
  });
});

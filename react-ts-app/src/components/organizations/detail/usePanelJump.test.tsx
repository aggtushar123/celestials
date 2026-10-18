import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePanelJump } from './usePanelJump';

function Harness({ onDetails, ready, openDetails }: { onDetails: boolean; ready: boolean; openDetails: () => void }) {
  const jump = usePanelJump(onDetails, ready, openDetails);
  return (
    <>
      <button type="button" onClick={() => jump('commercial')}>
        Jump
      </button>
      {onDetails ? <section data-panel="commercial">Commercial</section> : null}
    </>
  );
}

describe('usePanelJump', () => {
  it('opens Details, then focuses the panel once Details shows and the row is there', async () => {
    const openDetails = vi.fn();
    const { rerender } = render(<Harness onDetails={false} ready={false} openDetails={openDetails} />);
    await userEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect(openDetails).toHaveBeenCalledOnce();
    rerender(<Harness onDetails ready={false} openDetails={openDetails} />);
    expect(screen.getByText('Commercial')).not.toHaveFocus();
    rerender(<Harness onDetails ready openDetails={openDetails} />);
    expect(screen.getByText('Commercial')).toHaveFocus();
    expect(screen.getByText('Commercial')).toHaveAttribute('tabindex', '-1');
  });

  it('moves again on a second jump while already on Details', async () => {
    const openDetails = vi.fn();
    render(<Harness onDetails ready openDetails={openDetails} />);
    await userEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect(screen.getByText('Commercial')).toHaveFocus();
    screen.getByRole('button', { name: 'Jump' }).focus();
    await userEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect(screen.getByText('Commercial')).toHaveFocus();
    expect(openDetails).toHaveBeenCalledTimes(2);
  });
});

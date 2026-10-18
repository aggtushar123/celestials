import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmedSwitch } from './ConfirmedSwitch';

const CONFIRM = { title: 'Send without review?', message: 'Surveys go out at night.', confirmLabel: 'Send without review' };

function Harness({ onEscape = vi.fn() }: { onEscape?: () => void }) {
  const [on, setOn] = useState(false);
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) onEscape();
      }}
    >
      <ConfirmedSwitch label="Send without review" checked={on} onChange={setOn} confirm={CONFIRM} />
    </div>
  );
}

describe('ConfirmedSwitch (spec §2.2)', () => {
  it('asks in place before turning on, and turns on when answered', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Send without review' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    const question = screen.getByRole('group', { name: 'Send without review?' });
    expect(question).toHaveTextContent('Surveys go out at night.');
    expect(within(question).getByText('Send without review?')).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(within(question).getByRole('button', { name: 'Send without review' }));
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('group', { name: 'Send without review?' })).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it('stays off on Cancel or Escape, with focus back on the switch, and Escape goes no further', async () => {
    const onEscape = vi.fn();
    render(<Harness onEscape={onEscape} />);
    const toggle = screen.getByRole('switch', { name: 'Send without review' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveFocus();
    await userEvent.click(toggle);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: 'Send without review?' })).toBeNull();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('turns off without asking', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Send without review' });
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Send without review' }));
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('group')).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

function Harness({ disabled }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onChange={setOn} label="Email digest" disabled={disabled} />;
}

describe('Switch (UI foundations spec §5.5)', () => {
  it('is a named switch that flips on click, 44px below sm', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Email digest' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveClass('min-h-11', 'sm:min-h-9');
    const knob = () => toggle.querySelector('[aria-hidden="true"] > span') as HTMLElement;
    // The knob sits left when off and moves right when on (the same node).
    const off = knob();
    expect(off).toHaveClass('left-0.5');
    expect(off).not.toHaveClass('left-[18px]');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle.querySelector('[aria-hidden="true"]')).toHaveClass('bg-accent');
    expect(knob()).toBe(off);
    expect(off).toHaveClass('left-[18px]');
    expect(off).not.toHaveClass('left-0.5');
  });

  it('takes its name from the words beside the track when it has no label', () => {
    render(
      <Switch checked onChange={vi.fn()}>
        Send without review
      </Switch>,
    );
    expect(screen.getByRole('switch', { name: 'Send without review' })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables with tokens, not opacity, and does not flip', async () => {
    render(<Harness disabled />);
    const toggle = screen.getByRole('switch', { name: 'Email digest' });
    expect(toggle).toBeDisabled();
    expect(toggle.className).not.toMatch(/opacity/);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});

describe('Switch busy (settings production spec §10.5)', () => {
  it('is aria-busy and ignores presses while a save runs, keeping focus', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Daily digest" busy onChange={onChange} />);
    const button = screen.getByRole('switch', { name: 'Daily digest' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    button.focus();
    await userEvent.click(button);
    expect(onChange).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
  });
});

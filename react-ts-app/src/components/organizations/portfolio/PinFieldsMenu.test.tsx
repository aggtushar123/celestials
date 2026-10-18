import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinFieldsMenu } from './PinFieldsMenu';

describe('PinFieldsMenu', () => {
  it('lists the 28 panel fields and toggles one', async () => {
    const onToggle = vi.fn();
    render(<PinFieldsMenu pins={[]} onToggle={onToggle} onClose={vi.fn()} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(28);
    await userEvent.click(screen.getByRole('checkbox', { name: 'NPS' }));
    expect(onToggle).toHaveBeenCalledWith('nps');
  });

  it('stops at three pins', () => {
    render(<PinFieldsMenu pins={['nps', 'tcv', 'domain']} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('3 of 3 pinned')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'CES' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'NPS' })).toBeEnabled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<PinFieldsMenu pins={[]} onToggle={vi.fn()} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('rows are tall enough to tap on phones', () => {
    render(<PinFieldsMenu pins={[]} onToggle={vi.fn()} onClose={vi.fn()} />);
    const label = screen.getByRole('checkbox', { name: 'NPS' }).closest('label');
    expect(label).toHaveClass('min-h-11', 'sm:min-h-8');
  });

  it('closes on an outside click but not on its trigger', async () => {
    const onClose = vi.fn();
    const trigger = document.createElement('button');
    trigger.textContent = 'Pin fields';
    document.body.appendChild(trigger);
    render(<PinFieldsMenu pins={[]} onToggle={vi.fn()} onClose={onClose} triggerRef={{ current: trigger }} />);
    await userEvent.click(trigger);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    document.body.removeChild(trigger);
  });

  it('does not force focus back to the trigger when closed by an outside click (the user moved focus on purpose)', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Pin fields';
    document.body.appendChild(trigger);
    const { unmount } = render(<PinFieldsMenu pins={[]} onToggle={vi.fn()} onClose={vi.fn()} triggerRef={{ current: trigger }} />);
    await userEvent.click(document.body);
    unmount();
    expect(trigger).not.toHaveFocus();
    document.body.removeChild(trigger);
  });

  it('restores focus to the trigger when closed via Escape', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Pin fields';
    document.body.appendChild(trigger);
    const { unmount } = render(<PinFieldsMenu pins={[]} onToggle={vi.fn()} onClose={vi.fn()} triggerRef={{ current: trigger }} />);
    await userEvent.keyboard('{Escape}');
    unmount();
    expect(trigger).toHaveFocus();
    document.body.removeChild(trigger);
  });
});

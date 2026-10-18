import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

type Scope = 'me' | 'team' | 'company';

function Harness({ size }: { size?: 'md' | 'sm' }) {
  const [value, setValue] = useState<Scope>('me');
  return (
    <SegmentedControl
      label="Scope"
      size={size}
      value={value}
      onChange={setValue}
      options={[
        { value: 'me', label: 'Me' },
        { value: 'team', label: 'My team' },
        { value: 'company', label: 'Company' },
      ]}
    />
  );
}

describe('SegmentedControl (UI foundations spec §5.3)', () => {
  it('is a labelled group whose one active segment is pressed', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Scope' })).toHaveClass('inline-flex', 'rounded-lg', 'border', 'border-line', 'bg-surface', 'p-0.5');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveClass('bg-subtle', 'text-ink', 'min-h-11', 'sm:min-h-8', 'text-[13px]');
    expect(screen.getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'My team' })).toHaveClass('text-ink-muted');
  });

  it('moves the pressed state on click', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByRole('button', { name: 'Company' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is smaller inside tiles, still 44px below sm', () => {
    render(<Harness size="sm" />);
    expect(screen.getByRole('button', { name: 'Me' })).toHaveClass('min-h-11', 'sm:min-h-6', 'px-2', 'text-[11px]');
  });
});

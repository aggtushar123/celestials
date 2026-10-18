import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from './SearchInput';

function Harness({ width }: { width?: 'grow' | 'full' }) {
  const [value, setValue] = useState('');
  return <SearchInput label="Search organizations by name or owner" placeholder="Search organizations" value={value} onChange={setValue} width={width} />;
}

describe('SearchInput (UI foundations spec §5.5)', () => {
  it('is a searchbox named by its hidden label, with a short placeholder', () => {
    render(<Harness />);
    const box = screen.getByRole('searchbox', { name: 'Search organizations by name or owner' });
    expect(box).toHaveAttribute('placeholder', 'Search organizations');
    expect(box).toHaveClass('min-h-11', 'sm:min-h-9', 'rounded-lg', 'border-line', 'bg-surface', 'pl-9', 'text-[13px]');
    expect(screen.getByText('Search organizations by name or owner')).toHaveClass('sr-only');
    expect(box.closest('label')!.parentElement).toHaveClass('flex-1', 'sm:max-w-sm');
  });

  it('offers Clear search only while there is a value, and clearing returns focus to the field', async () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, 'Uber');
    expect(box).toHaveValue('Uber');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('takes the full width when asked', () => {
    render(<Harness width="full" />);
    expect(screen.getByRole('searchbox').closest('label')!.parentElement).toHaveClass('w-full');
  });
});

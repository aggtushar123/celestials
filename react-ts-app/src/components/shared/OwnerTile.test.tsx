import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnerTile } from './OwnerTile';
import type { User } from '../../features/auth/authSlice';

const MEMBERS = [{ id: 1, name: 'Alice CSM', function: 'cs' }] as unknown as User[];

describe('OwnerTile', () => {
  it('shows a rejected save\'s message inline and keeps the form open, instead of showing nothing', async () => {
    const onSave = vi.fn(async () => 'Only Leadership may reassign this account.');
    render(<OwnerTile owner={null} members={MEMBERS} mayChange onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await userEvent.selectOptions(screen.getByLabelText('New account owner'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Only Leadership may reassign this account.');
    // The form is still open: the picker and Save/Cancel are still there.
    expect(screen.getByLabelText('New account owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('closes the form and clears any earlier error on a successful save', async () => {
    const onSave = vi.fn().mockResolvedValueOnce('Try again later.').mockResolvedValueOnce(null);
    render(<OwnerTile owner={null} members={MEMBERS} mayChange onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await userEvent.selectOptions(screen.getByLabelText('New account owner'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New account owner')).not.toBeInTheDocument();
  });
});

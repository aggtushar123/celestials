import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotesTab } from './NotesTab';
import type { Note } from '../../../features/customers/customersSlice';

const mine: Note = { id: 1, title: 'Renewal risk', author_name: 'Dana', author: { id: 3, name: 'Dana' }, body: 'Procurement is stalling.', logged_at: '2026-09-16', links: 0 };

describe('NotesTab', () => {
  it('lets the viewer write a note and says who will see it', async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<NotesTab notes={[mine]} isLoading={false} error={null} onCreate={onCreate} />);

    expect(screen.getByText(/seen by you and your management chain only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New note' }));
    await user.type(screen.getByLabelText('Note title'), 'Call with Sam');
    await user.type(screen.getByLabelText('Note body'), 'Wants a discount.');
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    expect(onCreate).toHaveBeenCalledWith({ title: 'Call with Sam', body: 'Wants a discount.' });
    await waitFor(() => expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument());
  });

  it('has no form for a record that cannot take a note', () => {
    render(<NotesTab notes={[]} isLoading={false} error={null} />);
    expect(screen.queryByRole('button', { name: 'New note' })).not.toBeInTheDocument();
    expect(screen.getByText('No notes found')).toBeInTheDocument();
  });

  // Review round 1, Important: "Logged by" used to load a pravatar.cc
  // placeholder image for every author; it now shares UserAvatar, so a
  // note's author shows as an initial with no third-party image request.
  it('shows who logged the note as an initial, with no third-party avatar request', () => {
    render(<NotesTab notes={[mine]} isLoading={false} error={null} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('D')).toBeInTheDocument();
  });
});

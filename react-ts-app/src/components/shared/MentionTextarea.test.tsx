import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MentionTextarea } from './MentionTextarea';
import { resetMembersCache } from '../../features/knowledge/useMembers';

function Harness({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState('');
  return <MentionTextarea aria-label="Box" value={value} onChange={setValue} onSubmit={onSubmit} />;
}

describe('MentionTextarea', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    resetMembersCache();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => [
      { id: 5, name: 'Mei Tanaka', function: 'analytics' },
      { id: 6, name: 'Mei Ling', function: 'sales' },
      { id: 7, name: 'Priya Nair', function: 'engineering' },
    ] })));
  });

  it('completes an @mention to the full name so two Meis never collide', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByLabelText('Box');
    await user.type(box, 'Ask @me');
    const list = await screen.findByRole('listbox', { name: 'People to mention' });
    expect(list).toHaveTextContent('Mei Tanaka');
    expect(list).toHaveTextContent('Mei Ling');
    expect(list).not.toHaveTextContent('Priya');
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(box).toHaveValue('Ask @Mei Ling '));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('offers a function before the people whose names match, and inserts its token', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByLabelText('Box');
    await user.type(box, 'Ask @eng');
    const list = await screen.findByRole('listbox', { name: 'People to mention' });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('@engineering');
    expect(options[0]).toHaveTextContent('whoever is responsible for this customer');
    expect(list).not.toHaveTextContent('Priya');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(box).toHaveValue('Ask @engineering '));
  });

  it('offers the whole team and keeps people reachable below it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const box = screen.getByLabelText('Box');
    await user.type(box, '@t');
    await screen.findByRole('listbox');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('@team');
    expect(options[0]).toHaveTextContent('everyone responsible for this customer');
    // "t" also matches Mei Tanaka by name; she stays offered after the group.
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Mei Tanaka')]),
    );
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(box).toHaveValue('@Mei Tanaka '));
  });

  it('submits on Enter only when no suggestion is open', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByLabelText('Box');
    await user.type(box, 'hello{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.type(box, ' @pri');
    await screen.findByRole('listbox');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(box).toHaveValue('hello @Priya Nair '));
  });
});

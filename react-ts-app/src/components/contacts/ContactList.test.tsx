import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PEOPLE } from '../../features/contacts/testContacts';
import { ContactList } from './ContactList';

function renderList(props: Partial<Parameters<typeof ContactList>[0]> = {}) {
  const handlers = { onRetry: vi.fn(), onClear: vi.fn(), onMore: vi.fn() };
  render(
    <MemoryRouter>
      <ContactList
        rows={PEOPLE}
        count={5}
        loading={false}
        error={null}
        filtered={false}
        next={null}
        loadingMore={false}
        moreError={null}
        selectedId={42}
        linkFor={(id) => `/contacts/${id}`}
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  );
  return handlers;
}

describe('ContactList (spec 2026-09-28 §3)', () => {
  it('lists one item per person, the open one marked', () => {
    renderList();
    const items = within(screen.getByRole('list', { name: 'People' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[1]).getByRole('link')).toHaveAttribute('aria-current', 'true');
  });

  it('loads more at the end', async () => {
    const { onMore } = renderList({ next: 'http://x/api/v1/contacts/?page=2' });
    await userEvent.click(screen.getByRole('button', { name: 'Load more (3 of 5)' }));
    expect(onMore).toHaveBeenCalledOnce();
  });

  it('shows a skeleton while loading, not a spinner', () => {
    renderList({ loading: true });
    expect(screen.getByText('Loading people')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'People' })).toBeNull();
  });

  it('shows an error with Try again', async () => {
    const { onRetry } = renderList({ error: 'Try later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('empty: says how people arrive, or offers to clear the filters', async () => {
    renderList({ rows: [], count: 0 });
    expect(screen.getByText('No people yet')).toBeInTheDocument();
    document.body.innerHTML = '';
    const { onClear } = renderList({ rows: [], count: 0, filtered: true });
    expect(screen.getByText('Nobody matches')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

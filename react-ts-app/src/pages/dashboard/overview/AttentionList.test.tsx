import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../../features/auth/authSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';

// Unit tier: the list on its own, with the snooze wrappers mocked at the
// module boundary (their paths are asserted in attentionApi.test.ts).
vi.mock('../../../features/attention/attentionApi', () => ({
  snooze: vi.fn(async () => undefined),
  unsnooze: vi.fn(async () => undefined),
}));

import { snooze, unsnooze } from '../../../features/attention/attentionApi';
import { ApiError } from '../../../lib/apiClient';
import type { AttentionItem } from '../../../features/attention/attentionApi';
import { DrillProvider } from '../drill/DrillContext';
import { DrillPanel } from '../drill/DrillPanel';
import { AttentionList } from './AttentionList';

const items: AttentionItem[] = [
  {
    key: 'renewal:12',
    kind: 'renewal',
    title: 'Uber',
    reason: 'renewal 45 days overdue · health Average',
    at_stake: 42_000,
    urgency: 1,
    score: 42_000,
    customer_id: 12,
    companies: [],
    fingerprint: { band: 'average' },
  },
  {
    key: 'anomaly:3',
    kind: 'anomaly',
    title: 'Similar reports across 2 of your companies',
    reason: 'first seen 3 days ago',
    at_stake: 30_000,
    urgency: 1,
    score: 30_000,
    customer_id: null,
    companies: [
      { id: 12, name: 'Uber' },
      { id: 7, name: 'Pizza Hut' },
    ],
  },
  {
    key: 'going_quiet:7',
    kind: 'going_quiet',
    title: 'Pizza Hut',
    reason: 'no touch in 80 days',
    at_stake: 9_500,
    urgency: 0.5,
    score: 4_750,
    customer_id: 7,
    companies: [],
  },
];

function renderList(props: Partial<Parameters<typeof AttentionList>[0]> = {}) {
  const store = configureStore({ reducer: { auth: authReducer } });
  const tree = (next: Partial<Parameters<typeof AttentionList>[0]>) => (
    <Provider store={store}>
      <MemoryRouter>
        <DrillProvider>
          <AttentionList items={items} currency="USD" loading={false} error={false} {...next} />
          <DrillPanel />
        </DrillProvider>
      </MemoryRouter>
    </Provider>
  );
  const view = render(tree(props));
  return { ...view, rerenderWith: (next: Partial<Parameters<typeof AttentionList>[0]>) => view.rerender(tree(next)) };
}

const rows = () => within(screen.getByRole('list', { name: 'Needs attention' })).getAllByRole('listitem');

describe('AttentionList', () => {
  beforeEach(() => {
    vi.mocked(snooze).mockReset().mockResolvedValue(undefined);
    vi.mocked(unsnooze).mockReset().mockResolvedValue(undefined);
  });

  it('renders items in order with tag, reason and money, and never the fingerprint', () => {
    renderList();
    const [first, second, third] = rows();
    expect(first).toHaveTextContent('Renewal');
    expect(first).toHaveTextContent('Uber');
    expect(first).toHaveTextContent('renewal 45 days overdue · health Average');
    expect(first).toHaveTextContent(formatCompactMoney(42_000, 'USD'));
    expect(second).toHaveTextContent('Anomaly');
    expect(third).toHaveTextContent('Going quiet');
    expect(third).toHaveTextContent(formatCompactMoney(9_500, 'USD'));
    expect(screen.queryByText(/average"/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('band');
  });

  it('scrolls a long list inside the card rather than growing the page', () => {
    renderList();
    const scroller = screen.getByRole('region', { name: 'Needs attention, scrollable' });
    expect(scroller).toHaveStyle({ maxHeight: '560px' });
    expect(within(scroller).getByRole('list', { name: 'Needs attention' })).toBeInTheDocument();
  });

  it('shows the count in the header', () => {
    renderList();
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByTestId('attention-count')).toHaveTextContent('3');
  });

  it('links a company title to its page', () => {
    renderList();
    expect(screen.getByRole('link', { name: 'Uber' })).toHaveAttribute('href', '/organizations/12');
  });

  it('opens the drill panel listing an anomaly’s companies', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Similar reports across 2 of your companies' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('2 companies');
    expect(within(dialog).getByText('Pizza Hut')).toBeInTheDocument();
    expect(within(dialog).getByText('Uber')).toBeInTheDocument();
  });

  it('snoozes for 7 days, hides the row, and Undo restores it in place', async () => {
    renderList();
    const first = rows()[0];
    await userEvent.click(within(first).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    expect(snooze).toHaveBeenCalledWith('renewal:12', { days: 7 });
    expect(screen.queryByRole('link', { name: 'Uber' })).not.toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('Snoozed');
    expect(screen.getByTestId('attention-count')).toHaveTextContent('2');

    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Undo: Uber' }));
    expect(unsnooze).toHaveBeenCalledWith('renewal:12');
    expect(within(rows()[0]).getByRole('link', { name: 'Uber' })).toBeInTheDocument();
    expect(screen.getByTestId('attention-count')).toHaveTextContent('3');
  });

  it('marks an item done', async () => {
    renderList();
    await userEvent.click(within(rows()[2]).getByRole('button', { name: 'Mark Pizza Hut done' }));
    expect(snooze).toHaveBeenCalledWith('going_quiet:7', { done: true });
    expect(rows()[2]).toHaveTextContent('Marked done');
    expect(within(rows()[2]).getByRole('button', { name: 'Undo: Pizza Hut' })).toBeInTheDocument();
  });

  it('restores the row and shows an alert when the snooze fails', async () => {
    vi.mocked(snooze).mockRejectedValueOnce(new Error('network'));
    renderList();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not snooze Uber');
    await waitFor(() => expect(within(rows()[0]).getByRole('link', { name: 'Uber' })).toBeInTheDocument());
  });

  it('says so when nothing needs attention', () => {
    renderList({ items: [] });
    expect(screen.getByText('Nothing needs you right now.')).toBeInTheDocument();
  });

  it('shows an error rather than an empty list', () => {
    renderList({ items: null, error: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load what needs attention.');
    expect(screen.queryByText('Nothing needs you right now.')).not.toBeInTheDocument();
  });

  it('keeps stale items visible under a compact inline error', () => {
    renderList({ error: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load for these filters. Showing the last list.');
    expect(screen.queryByText('Could not load what needs attention.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Uber' })).toBeInTheDocument();
  });

  it('keeps the Undo line through a reload that drops the item, and Undo puts it back in place', async () => {
    const { rerenderWith } = renderList();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    // The server no longer returns the snoozed item.
    rerenderWith({ items: items.slice(1) });
    expect(rows()).toHaveLength(3);
    expect(rows()[0]).toHaveTextContent('Snoozed');
    expect(screen.getByTestId('attention-count')).toHaveTextContent('2');

    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Undo: Uber' }));
    expect(unsnooze).toHaveBeenCalledWith('renewal:12');
    expect(within(rows()[0]).getByRole('link', { name: 'Uber' })).toBeInTheDocument();
    expect(rows()).toHaveLength(3);

    // Once the server returns it again, it is shown once, not twice.
    rerenderWith({ items });
    expect(rows()).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'Uber' })).toHaveLength(1);
  });

  it('never shows an acted item twice while the server still returns it', async () => {
    const { rerenderWith } = renderList();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    rerenderWith({ items: [...items] });
    expect(rows()).toHaveLength(3);
    expect(rows()[0]).toHaveTextContent('Snoozed');
    expect(screen.queryByRole('link', { name: 'Uber' })).not.toBeInTheDocument();
  });

  it('disables Undo while the snooze is in flight, and Snooze and Done while the undo is', async () => {
    let finishSnooze!: () => void;
    vi.mocked(snooze).mockImplementationOnce(() => new Promise<void>((resolve) => (finishSnooze = resolve)));
    let finishUndo!: () => void;
    vi.mocked(unsnooze).mockImplementationOnce(() => new Promise<void>((resolve) => (finishUndo = resolve)));
    renderList();

    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    const undoButton = within(rows()[0]).getByRole('button', { name: 'Undo: Uber' });
    expect(undoButton).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled, not disabled, so it can hold focus; a click does nothing.
    await userEvent.click(undoButton);
    expect(unsnooze).not.toHaveBeenCalled();
    finishSnooze();
    await waitFor(() => expect(within(rows()[0]).getByRole('button', { name: 'Undo: Uber' })).not.toHaveAttribute('aria-disabled'));

    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Undo: Uber' }));
    expect(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(rows()[0]).getByRole('button', { name: 'Mark Uber done' })).toHaveAttribute('aria-disabled', 'true');
    finishUndo();
    await waitFor(() => expect(within(rows()[0]).getByRole('button', { name: 'Mark Uber done' })).not.toHaveAttribute('aria-disabled'));
  });

  it('shows five skeleton rows while loading, never a spinner', () => {
    renderList({ items: null, loading: true });
    expect(screen.getAllByTestId('attention-skeleton-row')).toHaveLength(5);
    expect(screen.getByRole('status')).toHaveTextContent('Loading what needs attention');
  });

  it.each([
    ['refetching', { loading: true }],
    ['showing a failed load', { error: true }],
  ])('makes stale rows read-only while %s', async (_label, state) => {
    const { rerenderWith } = renderList();
    await userEvent.click(within(rows()[2]).getByRole('button', { name: 'Snooze Pizza Hut for 7 days' }));
    rerenderWith(state);
    expect(screen.getByRole('list', { name: 'Needs attention' })).toHaveAttribute('aria-busy', 'true');
    expect(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' })).toBeDisabled();
    expect(within(rows()[0]).getByRole('button', { name: 'Mark Uber done' })).toBeDisabled();
    expect(within(rows()[2]).getByRole('button', { name: 'Undo: Pizza Hut' })).toBeDisabled();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    expect(snooze).toHaveBeenCalledTimes(1);
  });

  it('is not busy on a fresh list', () => {
    renderList();
    expect(screen.getByRole('list', { name: 'Needs attention' })).not.toHaveAttribute('aria-busy');
  });

  it('moves focus to Undo after Snooze, and back to Snooze after Undo', async () => {
    renderList();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    const undoButton = within(rows()[0]).getByRole('button', { name: 'Undo: Uber' });
    expect(document.activeElement).toBe(undoButton);
    expect(rows()[0]).toHaveAttribute('aria-live', 'polite');

    await userEvent.click(undoButton);
    await waitFor(() =>
      expect(document.activeElement).toBe(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' })),
    );
  });

  it('moves focus to Undo after Done', async () => {
    renderList();
    await userEvent.click(within(rows()[1]).getByRole('button', { name: 'Mark Similar reports across 2 of your companies done' }));
    expect(document.activeElement).toBe(
      within(rows()[1]).getByRole('button', { name: 'Undo: Similar reports across 2 of your companies' }),
    );
  });

  it('returns focus to the restored row’s Snooze when the action fails', async () => {
    vi.mocked(snooze).mockRejectedValueOnce(new Error('network'));
    renderList();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    await screen.findByRole('alert');
    await waitFor(() =>
      expect(document.activeElement).toBe(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' })),
    );
  });

  it('treats a 404 on Undo as done: the row stays restored, no alert', async () => {
    vi.mocked(unsnooze).mockRejectedValueOnce(new ApiError(404, { detail: 'Not found.' }, 'Not found.'));
    renderList();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Undo: Uber' }));
    await waitFor(() => expect(unsnooze).toHaveBeenCalled());
    expect(within(rows()[0]).getByRole('link', { name: 'Uber' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('restores the Undo line when Undo fails for another reason', async () => {
    vi.mocked(unsnooze).mockRejectedValueOnce(new ApiError(500, null, 'Server error'));
    renderList();
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Snooze Uber for 7 days' }));
    await userEvent.click(within(rows()[0]).getByRole('button', { name: 'Undo: Uber' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not undo Uber');
    expect(rows()[0]).toHaveTextContent('Snoozed');
  });

  it('says "1 company" for an anomaly spanning one', async () => {
    const single = { ...items[1], key: 'anomaly:9', title: 'One-off report', companies: [{ id: 7, name: 'Pizza Hut' }] };
    renderList({ items: [single] });
    await userEvent.click(screen.getByRole('button', { name: 'One-off report' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('1 company');
    expect(dialog).not.toHaveTextContent('1 companies');
  });

  it('offers no "Why?" outside the dashboard frame', () => {
    renderList();
    expect(screen.queryByRole('button', { name: /^Ask why/ })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttentionList } from '../overview/AttentionList';
import type { AttentionItem } from '../../../features/attention/attentionApi';
import { resetViewport } from '../../../test/viewport';
import { postedBodies, stubCopilot } from '../../../components/copilot/testCopilot';
import { renderDashboard } from './testAsk';
import { useAsk } from './useAsk';

const items: AttentionItem[] = [
  { key: 'renewal:12', kind: 'renewal', title: 'Uber', reason: 'renewal 45 days overdue', at_stake: 42_000, urgency: 1, score: 42_000, customer_id: 12, companies: [] },
];

const two: AttentionItem[] = [
  ...items,
  { key: 'renewal:15', kind: 'renewal', title: 'Lyft', reason: 'renewal 10 days overdue', at_stake: 9_000, urgency: 2, score: 9_000, customer_id: 15, companies: [] },
];

function ListWithDraft() {
  const ask = useAsk();
  return (
    <div>
      <AttentionList items={two} currency="USD" loading={false} error={false} />
      <button type="button" onClick={() => ask?.draft('Why are these at risk?', { kind: 'companies', ids: [3] })}>
        Draft
      </button>
      <button type="button" onClick={() => ask?.ask('Straight in?', { kind: 'attention', key: 'renewal:15' })}>
        Ask directly
      </button>
    </div>
  );
}

describe('"Why?" on an attention row', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => resetViewport());

  it('opens a collapsed rail and asks at once, about that item', async () => {
    const { spy } = stubCopilot();
    renderDashboard('/dashboard/overview?owner=2', () => <AttentionList items={items} currency="USD" loading={false} error={false} />, 1100);
    expect(screen.queryByRole('complementary', { name: 'Ask Revenact' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ask why Uber is on my list' }));
    expect(screen.getByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(await screen.findByText('Answer to: Why is this on my list?')).toBeInTheDocument();
    expect(postedBodies(spy)).toEqual([
      {
        content: 'Why is this on my list?',
        context: { surface: 'dashboard', area: 'overview', view: null, filters: { owner: '2', lifecycle: '', customer: '' }, focus: { kind: 'attention', key: 'renewal:12' } },
      },
    ]);
  });

  it('is off while the list is stale', () => {
    stubCopilot();
    renderDashboard('/dashboard/overview', () => <AttentionList items={items} currency="USD" loading error={false} />, 1440);
    expect(screen.getByRole('button', { name: 'Ask why Uber is on my list' })).toBeDisabled();
  });

  it('waits while an answer is in flight: sends nothing and keeps the draft and its focus', async () => {
    const { spy, release } = stubCopilot({ hold: true });
    renderDashboard('/dashboard/overview', () => <ListWithDraft />, 1440);
    await userEvent.click(screen.getByRole('button', { name: 'Ask why Uber is on my list' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Thinking…');
    await userEvent.click(screen.getByRole('button', { name: 'Draft' }));
    const lyft = screen.getByRole('button', { name: 'Ask why Lyft is on my list' });
    expect(lyft).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(lyft);
    await userEvent.click(screen.getByRole('button', { name: 'Ask directly' }));
    expect(postedBodies(spy)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove focus' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveValue('Why are these at risk?');
    release();
    expect(await screen.findByText('Answer to: Why is this on my list?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask why Lyft is on my list' })).not.toHaveAttribute('aria-disabled');
  });
});

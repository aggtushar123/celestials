import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDrill } from '../pages/dashboard/drill/useDrill';
import { DashboardToolbar } from '../pages/dashboard/shared/DashboardToolbar';
import { bookFilters } from '../pages/dashboard/shared/bookFilters';
import { AttentionList } from '../pages/dashboard/overview/AttentionList';
import { renderDashboard, Where } from '../pages/dashboard/ask/testAsk';
import { postedBodies, stubCopilot } from '../components/copilot/testCopilot';
import { resetViewport } from '../test/viewport';
import type { AttentionItem } from '../features/attention/attentionApi';

// End-to-end tier (jsdom, no browser): the real dashboard frame, providers,
// rail, drill panel and toolbar; one stub view holding a toolbar, an
// attention list and a drillable figure. Only the network is mocked.

const items: AttentionItem[] = [
  { key: 'risk:12', kind: 'risk', title: 'Uber', reason: 'risk 62', at_stake: 42_000, urgency: 1, score: 42_000, customer_id: 12, companies: [] },
];
const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };

function Screen() {
  const { open } = useDrill();
  return (
    <div>
      <DashboardToolbar subViews={[]} filters={bookFilters({ owners: [{ value: '2', name: 'Priya' }], lifecycles: [], customers: [] })} />
      <AttentionList items={items} currency="USD" loading={false} error={false} />
      <button
        type="button"
        onClick={(event) => open({ title: 'At risk', figure: '$80.1K', source: { kind: 'rows', rows: [{ id: '3', name: 'Uber' }, { id: '7', name: 'Pizza Hut' }] } }, event.currentTarget)}
      >
        At risk $80.1K
      </button>
      <Where />
    </div>
  );
}

describe('Ask Revenact on the dashboard', () => {
  afterEach(() => {
    resetViewport();
    vi.unstubAllGlobals();
  });

  it('asks, follows the screen, drills, asks why, and restores a conversation from history', { timeout: 30000 }, async () => {
    const { spy } = stubCopilot({
      conversations: [{ id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin }],
      conversationById: {
        9: { id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin, messages: [{ id: 1, role: 'assistant', content: 'Two renewals slipped.', sources: [], questions: [], created_at: '' }] },
      },
    });
    renderDashboard('/dashboard/overview', () => <Screen />, 1440);
    const log = () => screen.getByRole('log', { name: 'Ask Revenact messages' });

    // 1. Ask on the Overview, from the empty rail (Communications' empty state).
    expect(within(log()).getByText('Ask about what is in front of you. Answers use your accounts, mail and tickets.')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'What should I act on first?{enter}');
    await screen.findByText('Answer to: What should I act on first?');
    expect(within(log()).getByText('Overview')).toBeInTheDocument();

    // 2. Change a filter and ask a follow-up: it carries the new filter, by name.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Primary Owner' }), '2');
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), 'And for Priya?{enter}');
    await screen.findByText('Answer to: And for Priya?');
    expect(within(log()).getByText('Overview · Owner: Priya')).toBeInTheDocument();
    expect(postedBodies(spy)[1].context).toMatchObject({ filters: { owner: '2', lifecycle: '', customer: '' }, focus: null });

    // 3. Open a drill and ask about its accounts.
    await userEvent.click(screen.getByRole('button', { name: 'At risk $80.1K' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask about these' }));
    expect(screen.getByPlaceholderText('Ask Revenact')).toHaveValue('Why are these in At risk?');
    await userEvent.type(screen.getByPlaceholderText('Ask Revenact'), '{enter}');
    await screen.findByText('Answer to: Why are these in At risk?');
    expect(postedBodies(spy)[2].context).toMatchObject({ focus: { kind: 'companies', ids: [3, 7] } });

    // 4. Why? on an attention row.
    await userEvent.click(screen.getByRole('button', { name: 'Ask why Uber is on my list' }));
    await screen.findByText('Answer to: Why is this on my list?');
    expect(postedBodies(spy)[3].context).toMatchObject({ focus: { kind: 'attention', key: 'risk:12' } });

    // 5. Reopen a conversation from history: the view it started on comes back.
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: /Why is at-risk ARR up\?/ }));
    expect(await screen.findByText('Two renewals slipped.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/revenue/forecast?owner=2'));
  });
});

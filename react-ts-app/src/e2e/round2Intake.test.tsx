import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { stubBundles } from '../features/agents/testBundles';
import { sent, stubAgents } from '../features/agents/testAgents';
import { AGENT_SETTINGS, FAST_LANE_OFF, FAST_LANE_ON, SIGNALS } from '../features/agents/testAgentsFixtures';
import { ITEM_JIRA, ITEM_SLACK, stubUnmatched } from '../features/work/testUnmatched';
import { renderPage, renderWork } from '../pages/work/testPages';
import { AgentsSettingsPage } from '../pages/settings/AgentsSettingsPage';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real router and pages; only fetch is stubbed,
// in the round 2 D3 contract's shapes. Nothing is sent to Slack or Jira.
// Carl matches one stranger's message and dismisses another; Alice switches
// the fast lane on and a member sees the summary. No em dash.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;

/** The match dialog's search reads /customers/?search= and /accounts/?search=. */
function stubRecordSearch() {
  const next = globalThis.fetch as unknown as Fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const ok = (results: unknown[]) => ({ ok: true, status: 200, json: async () => ({ results }) });
    if (url.pathname.endsWith('/customers/') && url.searchParams.has('search')) return ok([{ id: 7, name: 'Pizza Hut' }]);
    if (url.pathname.endsWith('/accounts/') && url.searchParams.has('search')) return ok([]);
    return next(input, init);
  });
}

describe('Agent bundles round 2 D3: wider intake', () => {
  it('matches one message to a customer, then dismisses the other', { timeout: 60000 }, async () => {
    stubBundles({ departments: [{ key: 'cs', label: 'Customer Success' }], needsCustomer: { 'department:cs': 2 } });
    stubUnmatched({ items: [ITEM_JIRA, ITEM_SLACK] });
    stubRecordSearch();
    renderWork('/work?queue=department:cs');

    const heading = await screen.findByRole('heading', { name: /^Needs a customer/ });
    const rail = screen.getByRole('link', { name: /Customer Success/ });
    expect(rail).toHaveTextContent('2');
    expect(heading).toHaveTextContent('Needs a customer 2');
    const jira = screen.getByText(ITEM_JIRA.title).closest('li') as HTMLElement;
    expect(within(jira).getByText('Critical')).toBeInTheDocument();

    // Match Ann's message to Pizza Hut and add her as a contact.
    await userEvent.click(within(jira).getByRole('button', { name: 'Match to a customer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Match to a customer' });
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Organisation or account' }), 'piz');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^Pizza Hut$/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Also add ann@newco\.io/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Match' }));
    expect(await screen.findByText('Matched to Pizza Hut. An agent reads it at the next run.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(ITEM_JIRA.title)).toBeNull());
    expect(screen.getByRole('heading', { name: /^Needs a customer/ })).toHaveTextContent('Needs a customer 1');

    // Dismiss the other, after the confirm.
    const slack = screen.getByText(ITEM_SLACK.title).closest('li') as HTMLElement;
    await userEvent.click(within(slack).getByRole('button', { name: 'Dismiss' }));
    const confirm = await screen.findByRole('dialog', { name: 'Dismiss this message?' });
    expect(within(confirm).getByText("It leaves this list and its text is deleted now. Revenact won't list it again.")).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Dismissed.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { name: /^Needs a customer/ })).toBeNull());
    expect(screen.queryByText(ITEM_SLACK.title)).toBeNull();
    expect(screen.getByText('Nothing is waiting in Customer Success.')).toBeInTheDocument();
  });

  it('lets an admin switch the fast lane on and add a word; a member sees the summary', { timeout: 60000 }, async () => {
    const signals = { ...SIGNALS, fast_lane: FAST_LANE_OFF };
    const settings = { ...AGENT_SETTINGS, signals };
    const agents = stubAgents({ settings });
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    await userEvent.click(within(section).getByRole('switch', { name: 'Fast lane' }));
    const words = await within(section).findByRole('group', { name: 'Words' });
    await userEvent.type(within(words).getByRole('textbox', { name: 'Words' }), 'outage{Enter}');
    expect(await within(words).findByRole('button', { name: 'Remove outage' })).toBeInTheDocument();
    expect(within(section).getByText('Used in the last hour: 0 of 10. In the last 24 hours: 0 of 50.')).toBeInTheDocument();
    expect(sent(agents.spy, 'PATCH', '/agents/settings/').at(-1)).toEqual({ fast_lane: { rules: { words: [...FAST_LANE_OFF.rules.words, 'outage'] } } });
  });

  it('shows a member the fast lane summary only', { timeout: 30000 }, async () => {
    stubAgents({ settings: { ...AGENT_SETTINGS, can_edit: false, signals: { ...SIGNALS, fast_lane: FAST_LANE_ON } } });
    renderPage(<AgentsSettingsPage />, '/settings/agents', { role: 'csm' });
    const section = await screen.findByRole('region', { name: 'Fast lane' });
    expect(within(section).getByText('On')).toBeInTheDocument();
    expect(within(section).getByText(/^Used in the last hour/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Fast lane' })).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { TEAM_MEMBERS } from '../features/knowledge/testHeads';
import { BUNDLES, B_ESCALATION, B_PARTICIPANT } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { SLACK_ITEM_LINKED, SLACK_THREAD_LINKED, TICKET_ITEM_FROM_SLACK, stubSlackConversation } from '../features/organizations/testSlack';
import { STORY_ITEMS, stubOrganizationPage } from '../features/organizations/testStory';
import { renderOrganizationPage } from '../pages/organizations/testDetail';
import { renderWork } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real router, pages and store; only fetch is
// stubbed, in the Slack escalations D4 contract's shapes. Fake people,
// channels and issues; nothing reaches Slack or Jira. No em dash.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

const NOTE = 'Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work.';
const KAN = { 611: { ticket_key: 'KAN-2', ticket_url: 'https://alfiee.atlassian.net/browse/KAN-2' } };

describe('Slack escalations D4, end to end', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('reviews a decided escalation, changes who has it, edits the reply around its chips and runs it (LC-D4a, LC-D4b)', { timeout: 60000 }, async () => {
    const { spy } = stubBundles({ bundles: [...BUNDLES, B_ESCALATION], members: TEAM_MEMBERS, skipSteps: { 612: NOTE }, outputs: KAN });
    renderWork(`/work?queue=mine&bundle=${B_ESCALATION.id}`);
    const panel = await screen.findByRole('dialog', { name: B_ESCALATION.title });

    // 1. The reply first; the thread decided, and who.
    const first = within(panel).getAllByTestId(/^step-/)[0];
    expect(first).toHaveAttribute('data-step', '614');
    expect(within(first).getByText('Runs last, once the Jira issue exists')).toBeInTheDocument();
    expect(within(panel).getByText('Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(within(panel).getByText('Faiz Jamal (Customer Success)')).toBeInTheDocument();

    // 2. Change to Erin: the PATCH carries only the person.
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '13');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(await within(panel).findByText('Now handled by Erin Engineer.')).toBeInTheDocument();
    const patch = spy.mock.calls.find(([input, init]) => init?.method === 'PATCH' && String(input).endsWith('/handler/'));
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ user_id: 13 });
    expect(within(panel).getByText('The thread said: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();

    // 3. The reply: markers in place, words added after them; the placeholders are saved when it runs.
    const reply = within(panel).getByTestId('step-614');
    const text = within(reply).getByRole('textbox', { name: 'Message' });
    expect(text).toHaveValue('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Erin Engineer (Engineering).');
    await userEvent.type(text, ' On it now.');

    // 4. Run: the edit is saved first, then the issue and the skipped assignment with its note.
    await userEvent.click(within(panel).getByRole('button', { name: /^Run \d selected$/ }));
    await waitFor(() => {
      const saved = spy.mock.calls.filter(([input, init]) => init?.method === 'PATCH' && String(input).endsWith('/steps/614/'));
      expect(JSON.parse(String(saved.at(-1)?.[1]?.body)).fields.text).toBe('Thanks Tushar. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}) with Erin Engineer (Engineering). On it now.');
    });

    expect(await within(within(panel).getByTestId('step-612')).findByText(NOTE)).toBeInTheDocument();
    expect(within(within(panel).getByTestId('step-611')).getByRole('link', { name: /Open KAN-2 in Jira/ })).toBeInTheDocument();
  });

  it('a participant who cannot open the customer runs it from the participant view (LC-D4a)', { timeout: 60000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, B_PARTICIPANT], members: TEAM_MEMBERS, outputs: { 621: KAN[611] } });
    renderWork(`/work?queue=mine&bundle=${B_PARTICIPANT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_PARTICIPANT.title });
    expect(within(panel).getByText('You can run this because you took part in the Slack thread.')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Globex (QA)' })).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: /^Run \d selected$/ }));
    expect(await within(within(panel).getByTestId('step-624')).findByText(/Applied/)).toBeInTheDocument();
  });

  it('shows the thread and its ticket on each other, and opens the thread from the ticket (LC-D4b)', { timeout: 60000 }, async () => {
    stubOrganizationPage({ items: [SLACK_ITEM_LINKED, TICKET_ITEM_FROM_SLACK, ...STORY_ITEMS] });
    stubSlackConversation({ detail: SLACK_THREAD_LINKED });
    renderOrganizationPage('/organizations/7');
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });

    await userEvent.click(await screen.findByRole('button', { name: /^Conversations/ }));
    const thread = (await screen.findByRole('button', { name: SLACK_ITEM_LINKED.title })).closest('[data-story-item]') as HTMLElement;
    expect(within(thread).getByRole('link', { name: /KAN-2 · In progress · Faiz Jamal/ })).toHaveAttribute('href', 'https://alfiee.atlassian.net/browse/KAN-2');

    await userEvent.click(screen.getByRole('button', { name: /^Tickets/ }));
    const from = await screen.findByRole('button', { name: 'From Slack: Mohd faiz in #all-alfiee' });
    await userEvent.click(from);
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText('Jira issues')).toBeInTheDocument();
    expect(within(sheet).getByText('Looking now.')).toBeInTheDocument();
  });
});

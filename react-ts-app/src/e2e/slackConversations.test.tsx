import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { stubBundles } from '../features/agents/testBundles';
import { SLACK_ITEM, stubSlackConversation } from '../features/organizations/testSlack';
import { STORY_ITEMS, stubOrganizationPage } from '../features/organizations/testStory';
import { ITEM_SLACK, stubUnmatched } from '../features/work/testUnmatched';
import { renderOrganizationPage } from '../pages/organizations/testDetail';
import { renderWork } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real router, pages and store; only fetch is
// stubbed, in the Slack escalations D1 contract's shapes. Fake people and
// channels; nothing is sent to Slack. No em dash.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('Slack as a conversation, end to end', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows a Slack thread under Conversations and opens the whole thread', { timeout: 30000 }, async () => {
    stubOrganizationPage({ items: [SLACK_ITEM, ...STORY_ITEMS] });
    stubSlackConversation();
    renderOrganizationPage('/organizations/7');
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });

    // Conversations lists it; Tickets does not.
    await userEvent.click(await screen.findByRole('button', { name: /^Conversations/ }));
    const title = await screen.findByRole('button', { name: SLACK_ITEM.title });
    const row = title.closest('[data-story-item]') as HTMLElement;
    expect(within(row).getByText('Slack thread · Mohd faiz · via Slack')).toBeInTheDocument();
    expect(within(row).getByText('#all-alfiee · 2 replies')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Tickets/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: SLACK_ITEM.title })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: /^Conversations/ }));

    // Open it: three messages, the app's marked, why it is filed here, the link.
    const open = await screen.findByRole('button', { name: SLACK_ITEM.title });
    await userEvent.click(open);
    const sheet = await screen.findByRole('dialog', { name: SLACK_ITEM.title });
    expect(await within(sheet).findByText('Looking now.')).toBeInTheDocument();
    expect(within(sheet).getByText('Hi team, our CSV exports have been failing since this morning, urgent. Can someone look?')).toBeInTheDocument();
    expect(within(sheet).getByText('Logged as KAN-2.')).toBeInTheDocument();
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(3);
    expect(within(sheet).getByText('App')).toBeInTheDocument();
    expect(within(sheet).getByText('Filed under Globex (QA) because the message names it.')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: /Open in Slack/ })).toHaveAttribute('href', 'https://slack.com/archives/C0CA7PPRP7A/p1792041415357099');

    // Escape closes it and focus returns to the title.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: SLACK_ITEM.title })).toHaveFocus();
  });

  it('matches a Slack message to a customer it mentions, with no contact to add', { timeout: 60000 }, async () => {
    stubBundles({ unassigned: true, needsCustomer: { unassigned: 1 } });
    stubUnmatched({ items: [ITEM_SLACK] });
    renderWork('/work?queue=unassigned');

    const row = (await screen.findByText(ITEM_SLACK.title)).closest('li') as HTMLElement;
    expect(within(row).getByText(/#support/)).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Match to a customer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Match to a customer' });
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    const mentioned = within(dialog).getByRole('group', { name: 'Mentioned' });
    expect(within(mentioned).getByRole('button', { name: 'Globex (QA)' })).toBeInTheDocument();
    expect(within(mentioned).getByRole('button', { name: 'Initech (QA)' })).toBeInTheDocument();
    await userEvent.click(within(mentioned).getByRole('button', { name: 'Globex (QA)' }));
    expect(within(mentioned).getByRole('button', { name: 'Globex (QA)' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Match' }));
    expect(await screen.findByText('Matched to Globex (QA). An agent reads it at the next run.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(ITEM_SLACK.title)).toBeNull());
  });
});

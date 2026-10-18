import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SlackMessageFeedItem } from '../../features/work/workTypes';
import { renderPage } from '../../pages/work/testPages';
import { FeedRow, type FeedRowProps } from './FeedRow';

// Unit + integration tier: a Slack message the person sent to Revenact
// (connections spec 2026-10-16 §3) shows its summary, sender, message,
// suggested step and a link back to Slack, and Dismiss removes it.

const ITEM: SlackMessageFeedItem = {
  key: 'slack_message:7', id: 7, kind: 'slack_message', title: 'Slack message from Priya',
  record: { type: 'customer', id: 3, name: 'Uber' }, from: { type: 'person', label: 'Slack' },
  at: '2026-10-16T10:00:00Z', due_date: null, priority: null, private: true, actions: ['open', 'dismiss'],
  detail: {
    summary: 'Priya says SSO broke again after the 2.4 release.',
    text: 'Hey, SSO broke again after 2.4, users are locked out',
    excerpt: 'Hey, SSO broke again after 2.4, users are locked out',
    sender: 'Priya (Uber)',
    permalink: 'https://slack.com/archives/D123/p1700000000000100',
    suggested_step: { kind: 'jira.create', label: 'Create a Jira issue' },
  },
};

/** With the backend's drafts and context (one click each, owner 2026-10-16). */
const ACTING: SlackMessageFeedItem = {
  ...ITEM,
  actions: ['open', 'dismiss', 'jira', 'reply'],
  detail: {
    ...ITEM.detail,
    sender: 'Faiz Jamal',
    context: { health_score: 4.1, health_category: 'poor', arr: 240000, renewal_date: '2026-11-19', days_to_renewal: 34, owner: 'Faiz Jamal' },
    open_tickets: [{ number: 'TKT-9246', title: 'SSO login loop', url: '', days_open: 5 }],
    jira: { available: true, project: 'KAN', summary: 'Uber: SSO fails after the 2.4 release', description: 'Admins are locked out.', key: '', url: '' },
    reply: { to: 'Faiz Jamal', draft: 'Thanks Faiz, looking now.', with_issue: 'Thanks Faiz, logged as {issue}.', sent_at: null, url: '' },
  },
};

/** Answers the two actions like the backend; records what was sent. */
function stubActions(opts: { jiraStatus?: number; replyStatus?: number } = {}) {
  const sent: { url: string; body: unknown }[] = [];
  const spy = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>(async (url, init) => {
    const path = String(url);
    sent.push({ url: path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path.endsWith('/jira/')) {
      const status = opts.jiraStatus ?? 200;
      return { ok: status < 400, status, json: async () => (status < 400 ? { key: 'KAN-14', url: 'https://alfiee.atlassian.net/browse/KAN-14' } : { detail: 'Jira refused: no permission.' }) };
    }
    if (path.endsWith('/reply/')) {
      const status = opts.replyStatus ?? 200;
      return { ok: status < 400, status, json: async () => (status < 400 ? { url: 'https://slack.com/archives/D123/p1' } : { detail: 'Slack refused.' }) };
    }
    return { ok: true, status: 204, json: async () => undefined };
  });
  vi.stubGlobal('fetch', spy);
  return sent;
}

const handlers = () => ({ onDone: vi.fn(), onSettled: vi.fn(), onGone: vi.fn(), onLost: vi.fn(), onAnswered: vi.fn() });
const props = (over: Partial<FeedRowProps> = {}) => ({ item: ITEM, group: 'suggested', isSm: true, me: 1, busy: false, error: null, ...handlers(), ...over }) as FeedRowProps & ReturnType<typeof handlers>;

function stub(status: number) {
  const spy = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>(async () => ({ ok: status < 400, status, json: async () => (status < 400 ? undefined : { detail: 'Not found.' }) }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('SlackMessageRow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the summary, who sent it, the message, the suggested step and a link back to Slack', () => {
    stub(204);
    renderPage(<ul><FeedRow {...props()} /></ul>, '/work/mine');
    const article = screen.getByRole('article', { name: 'Priya says SSO broke again after the 2.4 release.' });
    expect(within(article).getByText('Priya (Uber)')).toBeInTheDocument();
    expect(article).toHaveTextContent('users are locked out');
    expect(within(article).getByText('Suggested next step: Create a Jira issue')).toBeInTheDocument();
    expect(within(article).getByRole('link', { name: 'Open in Slack' })).toHaveAttribute('href', 'https://slack.com/archives/D123/p1700000000000100');
  });

  it('says who it was handed to when the sender tagged colleagues (2026-10-18)', () => {
    stub(204);
    const item = { ...ITEM, detail: { ...ITEM.detail, handed_to: [{ id: 2, name: 'Tushar Aggarwal' }, { id: 3, name: 'Jesh' }] } };
    renderPage(<ul><FeedRow {...props({ item })} /></ul>, '/work/mine');
    expect(screen.getByText('Sent to Tushar Aggarwal and Jesh')).toBeInTheDocument();
  });

  it('shows no handed-to line when nobody was tagged', () => {
    stub(204);
    renderPage(<ul><FeedRow {...props({ item: { ...ITEM, detail: { ...ITEM.detail, handed_to: [] } } })} /></ul>, '/work/mine');
    expect(document.querySelector('[data-part="handed-to"]')).toBeNull();
  });

  it('dismisses it with the owner-only endpoint and settles the row', async () => {
    const spy = stub(204);
    const p = props();
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(ITEM, { text: 'Slack message dismissed.' }));
    expect(spy.mock.calls.some(([url, init]) => String(url).endsWith('/work/slack-messages/7/') && init?.method === 'DELETE')).toBe(true);
  });

  it('a message that is already gone leaves the feed saying so', async () => {
    stub(404);
    const p = props();
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(p.onLost).toHaveBeenCalledWith(ITEM, 'That Slack message is no longer in your Work.'));
  });

  it('shows the customer context and its open tickets above the two actions', () => {
    stubActions();
    renderPage(<ul><FeedRow {...props({ item: ACTING })} /></ul>, '/work/mine');
    const context = screen.getByRole('group', { name: 'About Uber' });
    expect(context).toHaveTextContent('Health 4.1');
    expect(context).toHaveTextContent('$240.0K ARR');
    expect(context).toHaveTextContent('Renews in 34d');
    expect(context).toHaveTextContent('TKT-9246 SSO login loop · 5 days open');
    expect(screen.getByLabelText('Jira issue title (KAN)')).toHaveValue('Uber: SSO fails after the 2.4 release');
    expect(screen.getByLabelText('Reply to Faiz Jamal, as you')).toHaveValue('Thanks Faiz, looking now.');
  });

  it('Create in Jira makes the issue with the title as edited, then shows its key and fills the reply', async () => {
    const sent = stubActions();
    renderPage(<ul><FeedRow {...props({ item: ACTING })} /></ul>, '/work/mine');
    const title = screen.getByLabelText('Jira issue title (KAN)');
    await userEvent.clear(title);
    await userEvent.type(title, 'Uber: SSO down');
    await userEvent.click(screen.getByRole('button', { name: 'Create in Jira' }));
    expect(await screen.findByRole('link', { name: 'KAN-14' })).toHaveAttribute('href', 'https://alfiee.atlassian.net/browse/KAN-14');
    expect(sent.find((r) => r.url.endsWith('/work/slack-messages/7/jira/'))?.body).toEqual({ summary: 'Uber: SSO down', description: 'Admins are locked out.' });
    expect(screen.getByLabelText('Reply to Faiz Jamal, as you')).toHaveValue('Thanks Faiz, logged as KAN-14 (https://alfiee.atlassian.net/browse/KAN-14).');
  });

  it('Send reply posts exactly what is in the box and says it was sent', async () => {
    const sent = stubActions();
    renderPage(<ul><FeedRow {...props({ item: ACTING })} /></ul>, '/work/mine');
    const box = screen.getByLabelText('Reply to Faiz Jamal, as you');
    await userEvent.clear(box);
    await userEvent.type(box, 'On it, Faiz.');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(await screen.findByText('Replied to Faiz Jamal.')).toBeInTheDocument();
    expect(sent.find((r) => r.url.endsWith('/reply/'))?.body).toEqual({ text: 'On it, Faiz.' });
    expect(screen.queryByRole('button', { name: 'Send reply' })).not.toBeInTheDocument();
  });

  it('Do both creates the issue first, then sends the reply carrying its link', async () => {
    const sent = stubActions();
    renderPage(<ul><FeedRow {...props({ item: ACTING })} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Do both' }));
    expect(await screen.findByText('Replied to Faiz Jamal.')).toBeInTheDocument();
    const order = sent.filter((r) => /\/(jira|reply)\/$/.test(r.url)).map((r) => r.url.split('/').at(-2));
    expect(order).toEqual(['jira', 'reply']);
    expect(sent.find((r) => r.url.endsWith('/reply/'))?.body).toEqual({ text: 'Thanks Faiz, logged as KAN-14 (https://alfiee.atlassian.net/browse/KAN-14).' });
  });

  it('a refused Jira issue says why, keeps the reply unsent, and Do both stops there', async () => {
    const sent = stubActions({ jiraStatus: 400 });
    renderPage(<ul><FeedRow {...props({ item: ACTING })} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Do both' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Jira refused: no permission.');
    expect(sent.some((r) => r.url.endsWith('/reply/'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeInTheDocument();
  });

  it('an issue already made and a reply already sent show as done, with nothing to click again', () => {
    stubActions();
    const done: SlackMessageFeedItem = {
      ...ACTING,
      detail: { ...ACTING.detail, jira: { ...ACTING.detail.jira!, key: 'KAN-9', url: 'https://alfiee.atlassian.net/browse/KAN-9' }, reply: { ...ACTING.detail.reply!, sent_at: '2026-10-16T12:00:00Z', url: 'https://slack.com/x' } },
    };
    renderPage(<ul><FeedRow {...props({ item: done })} /></ul>, '/work/mine');
    expect(screen.getByRole('link', { name: 'KAN-9' })).toBeInTheDocument();
    expect(screen.getByText('Replied to Faiz Jamal.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create in Jira|Send reply|Do both/ })).not.toBeInTheDocument();
  });

  it('without a Jira connection it says where to connect one and still offers the reply', () => {
    stubActions();
    const noJira: SlackMessageFeedItem = { ...ACTING, detail: { ...ACTING.detail, jira: { ...ACTING.detail.jira!, available: false, project: '' } } };
    renderPage(<ul><FeedRow {...props({ item: noJira })} /></ul>, '/work/mine');
    expect(screen.getByText('Connect Jira in Settings › Connections to create issues from here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create in Jira|Do both/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeInTheDocument();
  });
});

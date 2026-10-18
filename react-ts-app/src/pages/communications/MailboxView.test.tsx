import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import communicationsReducer from '../../features/communications/communicationsSlice';
import mailReducer from '../../features/mail/mailSlice';
import mailboxReducer from '../../features/mail/mailboxSlice';
import connectorsReducer from '../../features/connectors/connectorsSlice';
import CommunicationsPage from './CommunicationsPage';
import { DRAFT_EMAIL, stubDrafts } from '../../features/agents/testDrafts';
import { calls } from '../../features/agents/testAgents';
import { MAIL_SUMMARY, stubMail, threadOf, threadRowOf } from '../../features/mail/testMail';
import type { MailMessage, MailMessageDetail } from '../../features/mail/mailboxSlice';

const invoice = {
  id: 1,
  thread_id: 't1',
  direction: 'received' as const,
  from_name: 'Circleback',
  from_address: 'billing@circleback.ai',
  to: [['Dana', 'dana@acme.io']] as [string, string][],
  cc: [] as [string, string][],
  bcc: [] as [string, string][],
  labels: [],
  has_attachments: false,
  subject: 'Subscription renewal',
  snippet: 'Your plan renews on 1 October.',
  sent_at: '2026-09-20T09:00:00Z',
  folder: 'inbox' as const,
  category: 'financial' as const,
  state: 'open' as const,
  is_read: false,
  is_starred: false,
  is_important: false,
  priority: false,
  account: null,
  sync_issue: null,
};

const pizza = {
  ...invoice,
  id: 2,
  from_name: 'Sam Pizza',
  from_address: 'sam@pizzahut.com',
  subject: 'Re: revised terms',
  snippet: 'Can we talk Thursday?',
  sent_at: '2026-08-14T09:00:00Z',
  category: 'general' as const,
  is_read: true,
  priority: true,
  account: { id: 3, name: 'Pizza Hut', type: 'customer' as const },
};

const summary = {
  has_mailbox: true,
  address: 'dana@acme.io',
  last_synced_at: '2026-09-21T10:00:00Z',
  import: null,
  paused_reason: null,
  folders: { inbox: 2, drafts: 1, sent: 4, done: 0, muted: 0 },
  unread: 1,
  categories: [{ category: 'financial', label: 'Financial', count: 2, subjects: ['Subscription renewal', 'Invoice 1042'], senders: ['Circleback'], more_senders: 1 }],
};

const draftRow: MailMessage = { ...invoice, folder: 'drafts', direction: 'sent', to: [['Sam', 'sam@pizzahut.com']] };

type Overrides = {
  detailStatus?: number;
  /** Refuses a PATCH that stars or unstars; the read PATCH on open still succeeds. */
  starStatus?: number;
  syncStatus?: number;
  paged?: boolean;
  draft?: boolean;
};

const INVOICE_BODY = 'Your plan renews on 1 October. Nothing to do.';
const detailOf = (row: MailMessage, body: string): MailMessageDetail => ({ ...row, body, html_body: '', attachments: [] });

function mockApi(overrides: Overrides = {}) {
  const calls: string[] = [];
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
    const patching = init?.method === 'PATCH';
    if (url.includes('/mail/sync/')) return ok(overrides.syncStatus ? { detail: 'Google refused the token.' } : { filed: 0 }, overrides.syncStatus ?? 200);
    if (url.includes('/mail/messages/1/thread/') && patching && overrides.starStatus && 'is_starred' in JSON.parse(String(init?.body))) return ok({ detail: 'nope' }, overrides.starStatus);
    if (url.includes('/mail/messages/1/thread/') && !patching && overrides.detailStatus) return ok({ detail: 'Not found.' }, overrides.detailStatus);
    if (url.includes('/mail/messages/1/thread/') && overrides.draft) return ok(threadOf([detailOf(draftRow, INVOICE_BODY)]));
    if (url.includes('/mail/messages/summary/')) return ok(summary);
    if (url.includes('/mail/messages/2/reply/')) return ok({ ...pizza, id: 9, direction: 'sent', folder: 'sent' }, 201);
    if (url.includes('/copilot/draft-reply/')) return ok({ draft: 'Hi Sam, Thursday works for us.', sources: [{ type: 'note', id: 7, label: 'Billing preference', date: '2026-09-01', company: 'Pizza Hut', company_type: 'customer', company_id: 3 }] });
    if (url.includes('/mail/messages/1/thread/') && patching) return ok(threadOf([{ ...detailOf(invoice, INVOICE_BODY), ...JSON.parse(String(init?.body)) }]));
    if (url.includes('/mail/messages/1/thread/')) return ok(threadOf([detailOf(invoice, INVOICE_BODY)]));
    if (url.includes('/mail/messages/2/thread/')) return ok(threadOf([detailOf(pizza, 'Can we talk Thursday? Sam')]));
    if (url.includes('/mail/labels/')) return ok([]);
    if (url.includes('/mail/threads/')) {
      const params = new URL(url, 'http://localhost').searchParams;
      let rows: MailMessage[] = [invoice, pizza];
      if (overrides.draft) rows = [draftRow];
      if (params.get('category') === 'financial') rows = [invoice];
      if (overrides.paged) {
        if (params.get('page') === '2') return ok({ count: 2, next: null, previous: 'x', results: [threadRowOf(pizza)] });
        return ok({ count: 2, next: 'http://localhost:8000/api/v1/mail/threads/?page=2', previous: null, results: [threadRowOf(invoice)] });
      }
      return ok({ count: rows.length, next: null, previous: null, results: rows.map((row) => threadRowOf(row)) });
    }
    if (url.includes('/mail/messages/')) {
      // Sent and Drafts list messages (Decision 1).
      const params = new URL(url, 'http://localhost').searchParams;
      const rows: MailMessage[] = params.get('folder') === 'sent' ? [] : [invoice, pizza];
      return ok({ count: rows.length, next: null, previous: null, results: rows });
    }
    if (url.includes('/communications/stats/')) return ok({ counts: { email: 0, question: 0, ticket: 0, call: 0 }, total: 0, oldest_waiting_days: null, stale_questions: 0, has_mailbox: true, scope: 'mine', ticket_scope_note: '' });
    if (url.includes('/communications/')) return ok({ count: 0, next: null, previous: null, results: [], truncated: false, mode: 'needs', scope: 'mine' });
    if (url.includes('/copilot/conversations/')) return ok([]);
    return ok({});
  });
  vi.stubGlobal('fetch', spy);
  return calls;
}

function renderMailbox(provider: 'google' | 'microsoft' = 'google') {
  const store = configureStore({
    reducer: { communications: communicationsReducer, mail: mailReducer, mailbox: mailboxReducer, connectors: connectorsReducer },
    preloadedState: {
      mail: { connection: { id: 1, provider, provider_display: 'Google', address: 'dana@acme.io', status: 'connected', two_way: true, paused_reason: null }, providers: [], loaded: true, saving: false, error: null, sending: false, sendError: null } as unknown as ReturnType<typeof mailReducer>,
      connectors: { items: [], isLoading: false, error: null, saving: false, saveError: null } as unknown as ReturnType<typeof connectorsReducer>,
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/communications?source=mailbox:google']}>
        <CommunicationsPage />
      </MemoryRouter>
    </Provider>
  );
}

describe('MailboxView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the whole mailbox: folders with counts, the categories block, and the list by month', { timeout: 15000 }, async () => {
    mockApi();
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const folders = within(mailbox).getByRole('navigation', { name: 'Folders' });
    expect(within(folders).getByRole('button', { name: /^Inbox/ })).toHaveTextContent('2');
    expect(within(folders).getByRole('button', { name: /^Sent/ })).toHaveTextContent('4');
    expect(within(mailbox).getByText('dana@acme.io')).toBeInTheDocument();
    expect(within(mailbox).getByText('1 unread')).toBeInTheDocument();

    const block = await within(mailbox).findByRole('region', { name: 'Waiting by category' });
    expect(within(block).getByText('Subscription renewal, Invoice 1042')).toBeInTheDocument();
    expect(within(block).getByText(/Circleback · \+1/)).toBeInTheDocument();

    expect(await within(mailbox).findByRole('region', { name: 'September' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('region', { name: 'August' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('img', { name: 'Unread message' })).toBeInTheDocument();
    // The folder title is the h2; Categories and the months sit under it.
    expect(within(block).getByRole('heading', { level: 3, name: 'Categories' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('heading', { level: 3, name: 'September' })).toBeInTheDocument();
    expect(within(mailbox).queryByRole('heading', { level: 2, name: 'September' })).toBeNull();
    expect(within(mailbox).getByText('Pizza Hut')).toBeInTheDocument();
  });

  it('a category block narrows the list, and the switches are real parameters', { timeout: 15000 }, async () => {
    const calls = mockApi();
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'August' });
    await userEvent.click(within(mailbox).getByRole('button', { name: /Subscription renewal, Invoice 1042/ }));
    await waitFor(() => expect(calls.some((c) => c.includes('/mail/threads/?category=financial'))).toBe(true));
    await waitFor(() => expect(within(mailbox).queryByRole('region', { name: 'August' })).not.toBeInTheDocument());
    await userEvent.click(within(mailbox).getByRole('switch', { name: 'Unread' }));
    await waitFor(() => expect(calls.some((c) => c.includes('category=financial&unread=true'))).toBe(true));
    await userEvent.click(within(mailbox).getByRole('button', { name: /^Sent/ }));
    await waitFor(() => expect(calls.some((c) => c.includes('/mail/messages/?folder=sent'))).toBe(true));
    expect(await within(mailbox).findByText('Nothing here')).toBeInTheDocument();
  });

  it('opens a message in place, marks it read, and replies from the mailbox', { timeout: 15000 }, async () => {
    const calls = mockApi();
    renderMailbox('microsoft');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Circleback' }));
    expect(await within(mailbox).findByText('Your plan renews on 1 October. Nothing to do.')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.startsWith('PATCH') && c.includes('/mail/messages/1/thread/'))).toBe(true));

    await userEvent.click(within(mailbox).getByRole('button', { name: /^Inbox$/ }));
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Sam Pizza' }));
    const message = await within(mailbox).findByRole('region', { name: 'Conversation' });
    expect(await within(message).findByText('Can we talk Thursday? Sam')).toBeInTheDocument();
    expect(within(message).getByRole('link', { name: /Pizza Hut/ })).toHaveAttribute('href', '/organizations/3');
    // The separator never wraps away from the date it introduces.
    const dot = within(message).getAllByText('·').find((el) => el.getAttribute('aria-hidden') === 'true') as HTMLElement;
    expect(dot.parentElement).toHaveClass('whitespace-nowrap');
    expect(dot.parentElement!.textContent).toMatch(/^·\s*\S/);
    expect(within(message).getByText(/filed on Pizza Hut/)).toBeInTheDocument();
    await userEvent.type(within(message).getByLabelText('Reply'), 'Thursday works.');
    await userEvent.click(within(message).getByRole('button', { name: 'Send reply' }));
    expect(await within(message).findByRole('status')).toHaveTextContent('Sent from your mailbox.');
    expect(calls.some((c) => c.startsWith('POST') && c.includes('/mail/messages/2/reply/'))).toBe(true);
  });

  it('never shows the last message under a new one after a filter change', { timeout: 15000 }, async () => {
    mockApi();
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Circleback' }));
    await within(mailbox).findByText('Your plan renews on 1 October. Nothing to do.');
    await userEvent.click(within(mailbox).getByRole('switch', { name: 'Unread' }));
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Sam Pizza' }));
    expect(within(mailbox).queryByText('Your plan renews on 1 October. Nothing to do.')).not.toBeInTheDocument();
    expect(await within(mailbox).findByText('Can we talk Thursday? Sam')).toBeInTheDocument();
  });

  it('a message that cannot be opened says so in the reading pane, and the list survives', { timeout: 15000 }, async () => {
    mockApi({ detailStatus: 404 });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Circleback' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    expect(await within(pane).findByRole('alert')).toHaveTextContent('Not found.');
    expect(within(mailbox).queryByText('Could not load your mail')).not.toBeInTheDocument();
    await userEvent.click(within(mailbox).getByRole('button', { name: /^Inbox$/ }));
    expect(await within(mailbox).findByRole('region', { name: 'September' })).toBeInTheDocument();
  });

  it('a failed star or done says so instead of pretending', { timeout: 15000 }, async () => {
    const calls = mockApi({ starStatus: 500 });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Circleback' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByText('Your plan renews on 1 October. Nothing to do.');
    // Opening the unread invoice read it, and that PATCH took: no alert yet.
    await waitFor(() => expect(calls.filter((c) => c.startsWith('PATCH') && c.includes('/mail/messages/1/thread/'))).toHaveLength(1));
    // It took: settling reads the summary a second time.
    await waitFor(() => expect(calls.filter((c) => c.includes('/mail/messages/summary/')).length).toBeGreaterThan(1));
    expect(within(mailbox).queryByRole('alert')).toBeNull();
    await userEvent.click(within(pane).getByRole('button', { name: 'Star' }));
    expect(await within(mailbox).findByRole('alert')).toHaveTextContent('nope');
  });

  it('a failed sync is visible', { timeout: 15000 }, async () => {
    mockApi({ syncStatus: 502 });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Sync now' }));
    expect(await within(mailbox).findByRole('alert')).toHaveTextContent('Google refused the token.');
  });

  it('follows the next page on Load more', { timeout: 15000 }, async () => {
    const calls = mockApi({ paged: true });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    expect(within(mailbox).queryByRole('region', { name: 'August' })).not.toBeInTheDocument();
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Load more (1 of 2)' }));
    expect(await within(mailbox).findByRole('region', { name: 'August' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('region', { name: 'September' })).toBeInTheDocument();
    expect(calls.some((c) => c.includes('/mail/threads/?page=2'))).toBe(true);
    expect(within(mailbox).queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('a reply refreshes the counts and marks the row read', { timeout: 15000 }, async () => {
    const calls = mockApi();
    renderMailbox('microsoft');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Sam Pizza' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByText('Can we talk Thursday? Sam');
    const before = calls.filter((c) => c.includes('/mail/messages/summary/')).length;
    await userEvent.type(within(pane).getByLabelText('Reply'), 'Thursday works.');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send reply' }));
    await within(pane).findByRole('status');
    await waitFor(() => expect(calls.filter((c) => c.includes('/mail/messages/summary/')).length).toBe(before + 1));
  });

  it('Draft with Copilot drafts from the open message', { timeout: 15000 }, async () => {
    const calls = mockApi();
    renderMailbox('microsoft');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Sam Pizza' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByText('Can we talk Thursday? Sam');
    await userEvent.click(within(pane).getByRole('button', { name: /draft with copilot/i }));
    expect(await within(pane).findByDisplayValue(/Thursday works for us/)).toBeInTheDocument();
    expect(within(pane).getByText('1 source used')).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST') && c.includes('/copilot/draft-reply/'))).toBe(true);
  });

  it('the Copilot has the mailbox as its context', { timeout: 15000 }, async () => {
    mockApi();
    renderMailbox();
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    expect(within(copilot).getByText('Gmail')).toBeInTheDocument();
  });

  it('a draft has no reply box (Outlook, which keeps the box elsewhere)', { timeout: 15000 }, async () => {
    mockApi({ draft: true });
    renderMailbox('microsoft');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Circleback' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByText('Your plan renews on 1 October. Nothing to do.');
    expect(within(pane).queryByLabelText('Reply')).not.toBeInTheDocument();
  });

  it('a draft offers no Reply, Reply all or Forward on two-way Gmail', { timeout: 15000 }, async () => {
    mockApi({ draft: true });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('region', { name: 'September' });
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Circleback' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByText('Your plan renews on 1 October. Nothing to do.');
    expect(within(pane).queryByRole('group', { name: 'Reply or forward' })).not.toBeInTheDocument();
    for (const name of ['Reply', 'Reply all', 'Forward']) expect(within(pane).queryByRole('button', { name })).not.toBeInTheDocument();
    expect(within(mailbox).getByRole('button', { name: 'Compose' })).toBeInTheDocument();
  });
});

describe('MailboxView: drafts from your agents (Agents delivery 2, Decision 10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const drafts = (options: Parameters<typeof stubDrafts>[0] = {}) => {
    mockApi();
    const mailbox = vi.mocked(fetch);
    return stubDrafts({ ...options, passThrough: (input, init) => mailbox(String(input), init) as Promise<unknown> });
  };
  const openDrafts = async () => {
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await userEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Drafts/ }));
    return mailbox;
  };

  it('lists the reader own email drafts above the mailbox drafts, and opens one keeping the source', { timeout: 15000 }, async () => {
    const { spy } = drafts();
    renderMailbox();
    const mailbox = await openDrafts();
    const list = await within(mailbox).findByRole('list', { name: 'Drafts from your agents' });
    expect(spy.mock.calls.some(([input]) => String(input).endsWith('/communications/drafts/?channel=email'))).toBe(true);
    const row = within(list).getByRole('link', { name: /Re: Renewal terms/ });
    expect(row).toHaveTextContent('Ann Lee <ann@x.com>');
    expect(row).toHaveTextContent('Pizza Hut');
    expect(row).toHaveTextContent('CS agent');
    // Siblings under the folder title; the mailbox drafts' months nest under theirs.
    expect(within(mailbox).getByRole('heading', { level: 3, name: 'From your agents' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('heading', { level: 3, name: 'In your mailbox' })).toBeInTheDocument();
    const months = await within(mailbox).findAllByRole('heading', { level: 4 });
    expect(months.length).toBeGreaterThan(0);
    expect(within(mailbox).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['From your agents', 'In your mailbox']);
    await userEvent.click(row);
    expect(await screen.findByRole('heading', { level: 2, name: 'Reply to Ann Lee' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the inbox' })).toHaveAttribute('href', '/communications?source=mailbox%3Agoogle');
  });

  it('says when there are none', { timeout: 15000 }, async () => {
    drafts({ drafts: [] });
    renderMailbox();
    const mailbox = await openDrafts();
    expect(await within(mailbox).findByText('No drafts from your agents.')).toBeInTheDocument();
  });

  it('hides an agent draft that is also a Gmail draft: its mailbox row stands for it (D3 Decision 11)', { timeout: 15000 }, async () => {
    drafts({ drafts: [{ ...DRAFT_EMAIL, mail_draft_id: 55 }] });
    renderMailbox();
    const mailbox = await openDrafts();
    expect(await within(mailbox).findByText('No drafts from your agents.')).toBeInTheDocument();
  });

  it('shows a skeleton, then Try again after a failed read', { timeout: 15000 }, async () => {
    drafts({ failList: 1 });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    // A synchronous click, so the read is still in flight when we look.
    fireEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Drafts/ }));
    expect(within(mailbox).getByText('Loading drafts from your agents').closest('[role="status"]')).not.toBeNull();
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Try again' }));
    expect(await within(mailbox).findByRole('list', { name: 'Drafts from your agents' })).toBeInTheDocument();
  });

  it('shows nothing of the agents outside the Drafts folder', { timeout: 15000 }, async () => {
    drafts();
    renderMailbox();
    await screen.findByRole('region', { name: 'Mailbox' });
    expect(document.querySelector('[data-part="agent-drafts"]')).toBeNull();
  });
});

describe('MailboxView: two-way Gmail D1', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // The list reads only: /mail/threads/ with or without a query.
  const lists = (spy: ReturnType<typeof stubMail>['spy']) => calls(spy, 'GET', '/mail/threads/').filter((c) => /^\/mail\/threads\/(\?|$)/.test(c)).length;

  it('says the import is running and why the mailbox is paused', { timeout: 15000 }, async () => {
    stubMail({ summary: { ...MAIL_SUMMARY, paused_reason: 'workspace_off' } });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const notice = await within(mailbox).findByText("Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.");
    expect(notice.closest('[role="status"]')).toHaveTextContent('Importing mail: 4,210 of about 18,000');
    expect(within(mailbox).getByRole('button', { name: 'Sync now' })).toBeDisabled();
  });

  it('a queued Sync now spins until the tick has run, then reads the list again', { timeout: 15000 }, async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { state, spy } = stubMail();
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await within(mailbox).findByRole('button', { name: 'Ann Lee' });
    const before = lists(spy);
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(calls(spy, 'POST', '/mail/sync/')).toHaveLength(1));
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Sync now' })).toBeDisabled());
    expect(lists(spy)).toBe(before);
    state.connection!.last_synced_at = '2026-10-10T09:20:00Z';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Sync now' })).toBeEnabled());
    await waitFor(() => expect(lists(spy)).toBe(before + 1));
  });
});

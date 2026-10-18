import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { resetViewport, setViewport } from '../../test/viewport';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import communicationsReducer from '../../features/communications/communicationsSlice';
import mailReducer from '../../features/mail/mailSlice';
import connectorsReducer from '../../features/connectors/connectorsSlice';
import CommunicationsPage from './CommunicationsPage';
import { SlotHost } from '../../test/SlotHost';
import { stubDrafts } from '../../features/agents/testDrafts';
import { DRAFT_EMAIL_ID } from '../../features/agents/testAgentsFixtures';

const emailRow = {
  id: 'email:412',
  kind: 'email' as const,
  who: 'Dana Whitfield',
  detail: 'Champion',
  subject: 'Re: revised renewal terms',
  snippet: 'We would need the revised terms before the board meets.',
  preview: 'Procurement came back with two problems.',
  sentiment: 'negative',
  waiting_since: '2026-09-09',
  waiting_days: 9,
  account: { id: 3, name: 'Pizza Hut', type: 'customer' as const },
  context: {
    health_score: 5.2,
    health_category: 'average',
    arr: 128400,
    renewal_date: '2026-10-22',
    days_to_renewal: 34,
    owner: 'Carl',
  },
  action: 'reply' as const,
  external_url: '',
};

const ticketRow = {
  ...emailRow,
  id: 'ticket:9',
  kind: 'ticket' as const,
  who: 'Zendesk #4182',
  detail: 'High',
  subject: 'Login fails for SSO users',
  snippet: 'Open for three days.',
  preview: 'SAML users land on a blank screen.',
  waiting_days: 3,
  action: 'open_external' as const,
  external_url: 'https://acme.zendesk.com/agent/tickets/4182',
};

/** Jira and Slack, connected (the sidebar shows Gmail, Slack and Jira only). */
const CONNECTORS = [
  { id: 5, provider: 'jira', provider_display: 'Jira Software', name: 'Jira Software', status: 'connected', is_enabled: true, department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true, ticket_count: 3, call_count: 0, last_record_at: null, has_credentials: true, config: {} },
  { id: 3, provider: 'slack', provider_display: 'Slack', name: 'Slack', status: 'connected', is_enabled: true, department: '', department_display: '', customers: [], accounts: [], is_organisation_wide: true, ticket_count: 158, call_count: 0, last_record_at: null, has_credentials: true, config: {} },
];

const slackRow = {
  ...emailRow,
  id: 'slack:21',
  kind: 'slack' as const,
  who: 'Faiz Jamal',
  detail: '#all-alfiee',
  subject: 'Twilio SSO is failing again',
  snippet: 'Their admins are locked out 🚨',
  preview: 'Faiz Jamal: Twilio SSO is failing again\nTushar: Their admins are locked out 🚨',
  sentiment: '',
  waiting_days: 0,
  action: 'open_external' as const,
  external_url: 'https://slack.com/archives/C0CA7PPRP7A/p1792147103754409',
};

const stats = {
  counts: { email: 1, question: 0, ticket: 1, call: 0 },
  total: 2,
  oldest_waiting_days: 9,
  stale_questions: 0,
  has_mailbox: true,
  scope: 'mine' as const,
  ticket_scope_note: 'Tickets are read by department.',
};

function mockApi(overrides: { rows?: unknown[]; stats?: Record<string, unknown>; mailbox?: unknown; connectors?: unknown[]; conversations?: unknown[]; conversation?: unknown } = {}) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
    if (url.includes('/communications/stats/')) return ok({ ...stats, ...(overrides.stats ?? {}) });
    // The Scheduled card above the rail reads the asker's own dated to-dos and tasks.
    if (url.includes('/work/feed/')) return ok({ groups: [], hidden: 0, failed: [] });
    if (url.includes('/mail/connection/')) return ok({ connection: overrides.mailbox ?? { id: 1, provider: 'google', provider_display: 'Google', address: 'alice@acme.io', status: 'connected' }, providers: [] });
    if (url.includes('/connectors/')) return ok(overrides.connectors ?? CONNECTORS);
    if (url.includes('/copilot/messages/') && init?.method === 'POST') {
      const content = JSON.parse(String(init.body)).content as string;
      return ok({ id: 1, title: 'Chat', created_at: '', updated_at: '', messages: [{ id: 1, role: 'user', content, sources: [], questions: [] }, { id: 2, role: 'assistant', content: 'Two tickets and one reply.', sources: [], questions: [] }] });
    }
    if (/\/copilot\/conversations\/\d+\/$/.test(url)) return ok(overrides.conversation ?? { id: 1, title: 'Chat', created_at: '', updated_at: '', messages: [] });
    if (url.includes('/copilot/conversations/')) return ok(overrides.conversations ?? []);
    if (url.includes('/communications/emails/412/reply/')) return ok({ id: 900, direction: 'sent', subject: 'Re: revised renewal terms' }, 201);
    const results = overrides.rows ?? [emailRow, ticketRow];
    const kind = new URL(url, 'http://localhost').searchParams.get('kind');
    const filtered = kind ? results.filter((r) => (r as { kind: string }).kind === kind) : results;
    return ok({ count: filtered.length, next: null, previous: null, results: filtered, truncated: false, mode: 'needs', scope: 'mine' });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderPage(path = '/communications') {
  const store = configureStore({
    reducer: { communications: communicationsReducer, mail: mailReducer, connectors: connectorsReducer },
    // The sidebar's group normally fetches these; the page only reads them.
    preloadedState: {
      mail: { connection: { id: 1, provider: 'google', provider_display: 'Google', address: 'alice@acme.io', status: 'connected' }, providers: [], loaded: true, saving: false, error: null, sending: false, sendError: null } as unknown as ReturnType<typeof mailReducer>,
      connectors: { items: CONNECTORS, isLoading: false, error: null, saving: false, saveError: null } as unknown as ReturnType<typeof connectorsReducer>,
    },
  });
  const { unmount } = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <SlotHost bare>
          <CommunicationsPage />
        </SlotHost>
      </MemoryRouter>
    </Provider>
  );
  return { store, unmount };
}


// A test that sets a viewport must not leak it into the next, even when it
// fails before its last line (fix round 1).
afterEach(() => resetViewport());

describe('CommunicationsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('lists the inbox with its waiting time, grouped by month', async () => {
    mockApi();
    renderPage();
    const queue = await screen.findByRole('region', { name: /queue/i });
    expect(await within(queue).findByText('Dana Whitfield')).toBeInTheDocument();
    expect(within(queue).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '9d waiting')).toBeInTheDocument();
    expect(within(queue).getByText('Zendesk #4182')).toBeInTheDocument();
    expect(within(queue).getByRole('heading', { level: 3, name: /September/ })).toBeInTheDocument();
  });

  it('shows the folders with their counts and a dash for replies when no mailbox has been read, and no nag', async () => {
    mockApi({ stats: { has_mailbox: false, counts: { email: 0, question: 0, ticket: 1, call: 0 }, total: 1 } });
    renderPage();
    const folders = await screen.findByRole('navigation', { name: /folders/i });
    expect(within(folders).getByRole('button', { name: /Replies owed/ })).toHaveTextContent('–');
    expect(within(folders).getByRole('button', { name: /Open tickets/ })).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: /connect mailbox/i })).not.toBeInTheDocument();
  });

  it('a folder narrows the inbox to one kind', async () => {
    const spy = mockApi();
    renderPage();
    await screen.findByText('Dana Whitfield');
    await userEvent.click(screen.getByRole('button', { name: /Open tickets/ }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.stringContaining('kind=ticket'), expect.anything()));
    const queue = await screen.findByRole('region', { name: /queue/i });
    await waitFor(() => expect(within(queue).queryByText('Dana Whitfield')).not.toBeInTheDocument());
    expect(within(queue).getByText('Zendesk #4182')).toBeInTheDocument();
  });

  it('opens an item in place, with the account context above the composer, and goes back', async () => {
    mockApi();
    renderPage();
    await userEvent.click(await screen.findByText('Dana Whitfield'));
    const detail = await screen.findByRole('region', { name: /selected item/i });
    expect(within(detail).getByText('34d')).toBeInTheDocument();
    expect(within(detail).getByText('$128.4K')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /send reply/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /^Inbox$/ }));
    expect(await screen.findByRole('region', { name: /queue/i })).toBeInTheDocument();
  });

  it('arriving from a source in the sidebar narrows the inbox and becomes the Copilot context', async () => {
    const spy = mockApi();
    renderPage('/communications?source=connector%3A5');
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.stringContaining('kind=ticket'), expect.anything()));
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    expect(await within(copilot).findByText('Jira')).toBeInTheDocument();
  });

  it("the sidebar's Slack lists Slack threads, newest first, each opening in Slack", async () => {
    const spy = mockApi({ rows: [emailRow, ticketRow, slackRow] });
    renderPage('/communications?source=connector%3A3');
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.stringContaining('kind=slack'), expect.anything()));
    await userEvent.click(await screen.findByText('Faiz Jamal'));
    expect(screen.queryByText('Dana Whitfield')).not.toBeInTheDocument();
    const detail = await screen.findByRole('region', { name: /selected item/i });
    expect(within(detail).getByRole('link', { name: /Open in Slack/ })).toHaveAttribute('href', slackRow.external_url);
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    expect(await within(copilot).findByText('Slack')).toBeInTheDocument();
  });

  it('the Copilot rail sends a real message and can be hidden from the top bar', async () => {
    setViewport(1440);
    mockApi();
    renderPage();
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    await userEvent.type(within(copilot).getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await within(copilot).findByText('Two tickets and one reply.')).toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('nav-actions')).getByRole('button', { name: /hide copilot/i }));
    expect(screen.queryByRole('complementary', { name: /copilot/i })).not.toBeInTheDocument();
    expect(localStorage.getItem('revenact_comms_copilot')).toBe('off');
  });

  it('History opens as a panel of scheduled tasks and searchable, collapsible recents', async () => {
    setViewport(1440);
    mockApi({
      conversations: [
        { id: 1, title: 'Which renewals are at risk?', created_at: '', updated_at: '' },
        { id: 2, title: 'What is going on with Pizza Hut?', created_at: '', updated_at: '' },
      ],
    });
    renderPage();
    await userEvent.click(await within(screen.getByTestId('nav-actions')).findByRole('button', { name: /^history$/i }));
    const panel = screen.getByRole('dialog', { name: 'History' });
    // Scheduling does not exist yet, so the plus is honest about it rather than opening a form.
    expect(within(panel).getByText('No scheduled tasks yet')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /new scheduled task/i })).toBeDisabled();
    expect(await within(panel).findByText('Which renewals are at risk?')).toBeInTheDocument();

    await userEvent.type(within(panel).getByPlaceholderText('Search chats…'), 'pizza');
    expect(within(panel).queryByText('Which renewals are at risk?')).not.toBeInTheDocument();
    expect(within(panel).getByText('What is going on with Pizza Hut?')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: /collapse recents/i }));
    expect(within(panel).queryByText('What is going on with Pizza Hut?')).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /expand recents/i }));
    expect(within(panel).getByText('What is going on with Pizza Hut?')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: /close history/i }));
    expect(screen.queryByRole('dialog', { name: 'History' })).not.toBeInTheDocument();
  });

  it('replies to a queue email from the mailbox and says so', { timeout: 15000 }, async () => {
    const spy = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Dana Whitfield/ }));
    const pane = await screen.findByRole('region', { name: 'Conversation' });
    await userEvent.type(within(pane).getByLabelText('Reply'), 'Thursday works.');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send reply' }));
    expect(await within(pane).findByRole('status')).toHaveTextContent(/Sent/);
    const call = spy.mock.calls.find(([url, init]) => String(url).includes('/communications/emails/412/reply/') && init?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ body: 'Thursday works.' });
  });

  it('treats an empty inbox as inbox zero', async () => {
    mockApi({ rows: [], stats: { total: 0, oldest_waiting_days: null, counts: { email: 0, question: 0, ticket: 0, call: 0 } } });
    renderPage();
    expect(await screen.findByText('Inbox zero')).toBeInTheDocument();
    expect(screen.getByText(/nothing between you and the rest of the day/i)).toBeInTheDocument();
  });

  it('regression: the rail still sends the source as a text prefix and no structured context', async () => {
    const spy = mockApi();
    renderPage('/communications?source=connector%3A5');
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    expect(await within(copilot).findByText('Jira')).toBeInTheDocument();
    expect(within(copilot).getByText('Nothing scheduled.')).toBeInTheDocument();
    await userEvent.type(within(copilot).getByPlaceholderText('Ask Revenact'), 'What is waiting?{enter}');
    expect(await within(copilot).findByText('Two tickets and one reply.')).toBeInTheDocument();
    const call = spy.mock.calls.find(([url, init]) => String(url).includes('/copilot/messages/') && init?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ content: '[About: Jira] What is waiting?' });
  });

  it('opens a dashboard conversation as plain text, with its tag, without leaving Communications', async () => {
    setViewport(1440);
    const origin = { surface: 'dashboard', area: 'revenue', view: 'forecast', filters: { owner: '2', lifecycle: '', customer: '' } };
    mockApi({
      conversations: [{ id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin }],
      conversation: {
        id: 9, title: 'Why is at-risk ARR up?', created_at: '', updated_at: '', origin,
        messages: [
          { id: 1, role: 'user', content: 'Why is at-risk ARR up?', context: { ...origin, focus: null }, sources: [], questions: [] },
          { id: 2, role: 'assistant', content: 'Two renewals slipped.', sources: [], questions: [] },
        ],
      },
    });
    renderPage();
    await userEvent.click(await within(screen.getByTestId('nav-actions')).findByRole('button', { name: /^history$/i }));
    const panel = screen.getByRole('dialog', { name: 'History' });
    expect(await within(panel).findByText('Revenue › Forecast')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /Why is at-risk ARR up\?/ }));
    const copilot = await screen.findByRole('complementary', { name: /copilot/i });
    expect(await within(copilot).findByText('Two renewals slipped.')).toBeInTheDocument();
    expect(within(copilot).queryByText('Revenue › Forecast · Owner: 2')).not.toBeInTheDocument();
  });

  it('explains a failure rather than showing half a picture', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/communications/stats/')) return Promise.resolve({ ok: true, status: 200, json: async () => stats });
        if (url.includes('/communications/')) return Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Server error.' }) });
        if (url.includes('/connectors/')) return Promise.resolve({ ok: true, status: 200, json: async () => [] });
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ connection: null, providers: [] }) });
      })
    );
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load your inbox/i);
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('CommunicationsPage: agent drafts (Agents delivery 2, Decision 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const chain = (overrides: Parameters<typeof mockApi>[0] = {}) => {
    const spy = mockApi(overrides);
    return stubDrafts({ passThrough: (input, init) => spy(String(input), init) });
  };
  const queueReads = (spy: ReturnType<typeof stubDrafts>['spy']) =>
    spy.mock.calls.filter(([input, init]) => new URL(String(input)).pathname === '/api/v1/communications/' && (init?.method ?? 'GET') === 'GET').length;

  it('opens ?draft= in place of the inbox card, with Back to the inbox', async () => {
    chain();
    renderPage(`/communications?draft=${DRAFT_EMAIL_ID}`);
    const region = await screen.findByRole('region', { name: 'Draft reply' });
    expect(await within(region).findByRole('heading', { level: 2, name: 'Reply to Ann Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inbox' })).toBeNull();
    expect(within(region).getByRole('link', { name: 'Back to the inbox' })).toHaveAttribute('href', '/communications');
  });

  it('hides the Copilot rail below lg while a draft is open, so the draft takes the width of a phone', async () => {
    chain();
    renderPage(`/communications?draft=${DRAFT_EMAIL_ID}`);
    await screen.findByRole('region', { name: 'Draft reply' });
    const rail = screen.getByRole('complementary', { name: 'Copilot' });
    expect(rail).toHaveClass('hidden', 'lg:flex', 'w-[320px]');
  });

  // UI broken-things fix 8: without a draft the rail used to stay at every
  // width and squeeze the inbox to a 10px sliver on a phone. It steps aside
  // below lg always, and so do the controls that only drive it.
  it('hides the Copilot rail and its controls below lg, and puts the controls in the bar from lg', async () => {
    setViewport(390);
    chain();
    const { unmount } = renderPage();
    await screen.findByRole('region', { name: 'Inbox' });
    expect(screen.getByRole('complementary', { name: 'Copilot' })).toHaveClass('hidden', 'lg:flex', 'w-[320px]');
    expect(within(screen.getByTestId('nav-actions')).queryByRole('button', { name: 'Hide Copilot' })).toBeNull();
    unmount();
    setViewport(1440);
    chain();
    renderPage();
    await screen.findByRole('region', { name: 'Inbox' });
    expect(within(screen.getByTestId('nav-actions')).getByRole('button', { name: 'Hide Copilot' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('header')).toBeNull();
  });

  it('starts with the folders folded on a phone, so the queue gets the width', async () => {
    setViewport(390);
    chain();
    renderPage();
    await screen.findByRole('region', { name: 'Inbox' });
    expect(screen.getByRole('button', { name: 'Show folders' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts with the folders open from sm', async () => {
    setViewport(1024);
    chain();
    renderPage();
    await screen.findByRole('region', { name: 'Inbox' });
    expect(screen.getByRole('button', { name: 'Hide folders' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the queue line for a row with a draft, and opens the draft from it', async () => {
    chain({ rows: [{ ...emailRow, draft: { id: DRAFT_EMAIL_ID, agent: 'cs', created_at: '2026-10-08T00:46:00Z' } }, ticketRow] });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Dana Whitfield/ }));
    const line = await screen.findByText('The CS agent drafted a reply.');
    const link = within(line.closest('[data-part="draft"]') as HTMLElement).getByRole('link', { name: 'Open draft' });
    expect(link).toHaveAttribute('href', `/communications?draft=${DRAFT_EMAIL_ID}`);
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { level: 2, name: 'Reply to Ann Lee' })).toBeInTheDocument();
  });

  it('shows no draft line on a row without one', async () => {
    chain();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Dana Whitfield/ }));
    await screen.findByRole('region', { name: 'Conversation' });
    expect(document.querySelector('[data-part="draft"]')).toBeNull();
  });

  it('reads the queue again after a draft is sent', async () => {
    const { spy } = chain();
    renderPage(`/communications?draft=${DRAFT_EMAIL_ID}`);
    // Scoped to the draft: the Copilot rail has a Send of its own, and it is
    // the only one until the draft has loaded.
    const region = await screen.findByRole('region', { name: 'Draft reply' });
    const send = await within(region).findByRole('button', { name: 'Send' });
    const before = queueReads(spy);
    await userEvent.click(send);
    await screen.findByText('Sent to Ann Lee <ann@x.com>.');
    await waitFor(() => expect(queueReads(spy)).toBeGreaterThan(before));
  });

  it('shows a failed load as an alert in place, with a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: 'Down.' }) })));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load your inbox')).toHaveClass('text-danger-ink');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(alert.className).not.toMatch(/bg-danger-dim/);
  });

  it('draws the empty queue with the shared empty state', async () => {
    mockApi({ rows: [] });
    renderPage();
    expect(await screen.findByText('Inbox zero')).toHaveClass('text-[15px]');
    expect(document.querySelector('.rounded-full.border-line-strong\\/60')).toBeNull();
  });

  it('lists the queue as flat grid rows in the glass shell, the waiting time neutral', async () => {
    mockApi();
    renderPage();
    const queue = await screen.findByRole('region', { name: /queue/i });
    const row = (await within(queue).findByRole('button', { name: 'Dana Whitfield' })).closest('li')!;
    expect(row).toHaveClass('flex', '@min-[44rem]:grid');
    expect(row.className).not.toMatch(/rv-glass-inner|rounded-xl|border-line\b/);
    // The figure and " waiting" sit in their own spans inside the muted line.
    const waiting = within(row).getByText(/waiting$/).parentElement!;
    expect(waiting).toHaveClass('text-ink-muted');
    expect(waiting.className).not.toMatch(/text-danger|text-warning|font-mono-brand/);
    // Narrow, the word is visually hidden but still read: never display:none.
    const word = within(row).getByText(/waiting$/);
    expect(word).toHaveClass('sr-only', '@min-[44rem]:not-sr-only');
    expect(word.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(row.parentElement).toHaveClass('divide-y', 'divide-line-subtle');
  });
});

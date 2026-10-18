import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EmailSuggestionFeedItem, MeetingProposalFeedItem, TaskFeedItem } from '../../features/work/workTypes';
import { renderPage } from '../../pages/work/testPages';
import { FeedRow, type FeedRowProps } from './FeedRow';

// Unit + integration tier (email agent, 2026-10-17): a meeting a colleague's
// email asked for shows its topic, who asked, who comes and when, never the
// email; Book books it (at another time if changed), Dismiss removes it. A
// task the agent made from an email says whose, and can be undone.

const local = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();

const PROPOSAL: MeetingProposalFeedItem = {
  key: 'meeting_proposal:4', id: 4, kind: 'meeting_proposal', title: 'Twilio health is dropping',
  record: { type: 'customer', id: 3, name: 'Twilio' }, from: { type: 'email_agent', label: 'From an email' },
  at: '2026-10-17T10:00:00Z', due_date: null, priority: null, private: true, actions: ['book', 'dismiss'],
  detail: {
    requester: { id: 2, name: 'Faiz' },
    attendees: [{ id: 1, name: 'Tushar' }, { id: 2, name: 'Faiz' }, { id: 3, name: 'Jesh' }],
    without_calendar: [{ id: 3, name: 'Jesh' }],
    proposed_start: local(19, 9),
    length_minutes: 30,
    urgent: true,
  },
};

const handlers = () => ({ onDone: vi.fn(), onSettled: vi.fn(), onGone: vi.fn(), onLost: vi.fn(), onAnswered: vi.fn() });
const props = (item: FeedRowProps['item'], over: Partial<FeedRowProps> = {}) =>
  ({ item, group: 'suggested', isSm: true, me: 1, busy: false, error: null, ...handlers(), ...over }) as FeedRowProps & ReturnType<typeof handlers>;

function stub(status: number, body: unknown = {}) {
  const sent: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return { ok: status < 400, status, json: async () => body };
    }),
  );
  return sent;
}

describe('MeetingProposalRow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the topic, who asked, who comes and the proposed time', () => {
    stub(200);
    renderPage(<ul><FeedRow {...props(PROPOSAL)} /></ul>, '/work/mine');
    const row = screen.getByRole('article', { name: 'Twilio health is dropping' });
    expect(row).toHaveTextContent('Faiz asked for a meeting');
    expect(row).toHaveTextContent('Urgent');
    expect(row).toHaveTextContent('Tushar, Faiz and Jesh');
    expect(row).toHaveTextContent('Jesh has no calendar connected: counted as free.');
    expect(within(row).getByLabelText('Date')).toHaveValue('2026-10-19');
    expect(within(row).getByLabelText('Starts')).toHaveValue('09:00');
  });

  it('books at the proposed time with one click, and the row leaves', async () => {
    const sent = stub(200, { status: 'booked', meeting_id: 9 });
    const p = props(PROPOSAL);
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Book with Meet' }));
    await waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(PROPOSAL, { text: 'Booked. Google is emailing the invites.' }));
    expect(sent[0].url).toContain('/email-agent/proposals/4/book/');
    expect(sent[0].body).toEqual({});
  });

  it('books at another time when the approver changes it', async () => {
    const sent = stub(200, { status: 'booked', meeting_id: 9 });
    renderPage(<ul><FeedRow {...props(PROPOSAL)} /></ul>, '/work/mine');
    const starts = screen.getByLabelText('Starts');
    await userEvent.clear(starts);
    await userEvent.type(starts, '14:30');
    await userEvent.click(screen.getByRole('button', { name: 'Book with Meet' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(new Date((sent[0].body as { starts_at: string }).starts_at).getHours()).toBe(14);
  });

  it("shows the server's refusal, and Dismiss removes it", async () => {
    stub(400, { code: 'CALENDAR_NOT_GRANTED', detail: 'Add Calendar to your Google connection first.' });
    const p = props(PROPOSAL);
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Book with Meet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add Calendar to your Google connection first.');
    stub(200, { status: 'dismissed' });
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(PROPOSAL, { text: 'Dismissed.' }));
  });

  it('asks for a time when nobody had one free', () => {
    stub(200);
    renderPage(<ul><FeedRow {...props({ ...PROPOSAL, detail: { ...PROPOSAL.detail, proposed_start: null } })} /></ul>, '/work/mine');
    expect(screen.getByText("Nobody's week had a free half hour: pick a time.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book with Meet' })).toHaveAttribute('aria-disabled', 'true');
  });
});

const EMAIL_TASK: TaskFeedItem = {
  key: 'task:30', id: 30, kind: 'task', title: 'Prepare the Twilio renewal deck',
  record: { type: 'customer', id: 3, name: 'Twilio' }, from: { type: 'email', label: 'From an email by Tushar' },
  at: '2026-10-17T10:00:00Z', due_date: '2026-10-19', priority: 'medium', private: false, actions: ['done', 'open'],
  detail: {
    id: 30, title: 'Prepare the Twilio renewal deck', due_date: '2026-10-19', status: 'pending', blocked_reason: '', priority: 'medium', source: 'agent',
    from_email: { by: 'Tushar', undo_until: new Date(Date.now() + 3_600_000).toISOString() },
  } as unknown as TaskFeedItem['detail'],
};

describe('A task from an email', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says whose email it came from, and Undo takes it back', async () => {
    const sent = stub(200, { undone: true });
    const p = props(EMAIL_TASK, { group: 'week' });
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    expect(screen.getByText('From an email by Tushar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo task Prepare the Twilio renewal deck' }));
    await waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(EMAIL_TASK, { text: 'Task undone.' }));
    expect(sent[0].url).toContain('/email-agent/tasks/30/undo/');
  });

  it('no Undo once the day is over', () => {
    stub(200);
    const late = { ...EMAIL_TASK, detail: { ...EMAIL_TASK.detail, from_email: { by: 'Tushar', undo_until: '2020-01-01T00:00:00Z' } } };
    renderPage(<ul><FeedRow {...props(late, { group: 'week' })} /></ul>, '/work/mine');
    expect(screen.queryByRole('button', { name: /Undo task/ })).toBeNull();
  });
});

const TASK_SUGGESTION: EmailSuggestionFeedItem = {
  key: 'email_suggestion:8', id: 8, kind: 'email_suggestion', title: 'Give Jesh a task: Prepare the Twilio renewal deck',
  record: { type: 'customer', id: 3, name: 'Twilio' }, from: { type: 'email_agent', label: 'From your email' },
  at: '2026-10-17T10:00:00Z', due_date: null, priority: null, private: true, actions: ['confirm', 'dismiss'],
  detail: { kind: 'task', assignee: { id: 3, name: 'Jesh' }, task_title: 'Prepare the Twilio renewal deck', due_date: '2026-10-19', urgent: false },
};

const MEETING_SUGGESTION: EmailSuggestionFeedItem = {
  ...TASK_SUGGESTION, key: 'email_suggestion:9', id: 9, title: 'Ask Tushar for a meeting: Twilio health is dropping',
  detail: { kind: 'meeting', approver: { id: 1, name: 'Tushar' }, attendees: PROPOSAL.detail.attendees, urgent: true },
};

describe('EmailSuggestionRow (the sender says yes first)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a task waits on the sender: Give Jesh the task confirms it', async () => {
    const sent = stub(200, { confirmed: true, task_id: 30 });
    const p = props(TASK_SUGGESTION);
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    const row = screen.getByRole('article', { name: 'Give Jesh a task: Prepare the Twilio renewal deck' });
    expect(row).toHaveTextContent('Nobody else sees this until you say yes');
    expect(row).toHaveTextContent('Due 19 Oct 2026');
    await userEvent.click(within(row).getByRole('button', { name: 'Give Jesh the task' }));
    await waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(TASK_SUGGESTION, { text: 'Task given to Jesh.' }));
    expect(sent[0].url).toContain('/email-agent/suggestions/8/confirm/');
  });

  it('a meeting request goes to Tushar only when the sender sends it; Dismiss drops it', async () => {
    const sent = stub(200, { dismissed: true });
    const p = props(MEETING_SUGGESTION);
    renderPage(<ul><FeedRow {...p} /></ul>, '/work/mine');
    expect(screen.getByRole('button', { name: 'Send the request to Tushar' })).toBeInTheDocument();
    expect(screen.getByText('With Tushar, Faiz and Jesh')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(p.onSettled).toHaveBeenCalledWith(MEETING_SUGGESTION, { text: 'Dismissed.' }));
    expect(sent[0].url).toContain('/email-agent/suggestions/9/dismiss/');
  });
});

import { describe, expect, it } from 'vitest';
import { labelState, leavesView, patchOfOp, patchRow, patchThread } from './mailOptimistic';
import type { MailLabel, MailMessageDetail, MailThread, MailThreadDetail } from './mailboxSlice';

// Unit tier: what an action does to the screen before the server answers
// (contract §3), with no store and no network.

const Q4: MailLabel = { id: 11, name: 'Q4', color: null, pending: false };
const RENEWALS: MailLabel = { id: 7, name: 'Renewals', color: { background: '#16a766', text: '#ffffff' }, pending: false };
const PILOT: MailLabel = { id: 12, name: 'Pilot', color: null, pending: true };
const KNOWN = [PILOT, Q4, RENEWALS];

const row: MailThread = {
  id: 1,
  thread_id: 't1',
  subject: 'Renewal quote',
  snippet: 'Quote attached.',
  last_sent_at: '2026-10-09T09:00:00Z',
  message_count: 3,
  unread_count: 1,
  participants: [{ name: 'Ann Lee', address: 'ann@pizzahut.com' }],
  more_participants: 0,
  is_read: false,
  is_starred: false,
  is_important: false,
  priority: false,
  state: 'open',
  folder: 'inbox',
  has_attachments: true,
  labels: [RENEWALS],
  account: null,
  sync_issue: null,
};

const message = (id: number, more: Partial<MailMessageDetail> = {}): MailMessageDetail => ({
  id,
  thread_id: 't1',
  direction: 'received',
  from_name: 'Ann Lee',
  from_address: 'ann@pizzahut.com',
  to: [],
  cc: [],
  bcc: [],
  labels: [RENEWALS],
  has_attachments: false,
  subject: 'Renewal quote',
  snippet: '',
  sent_at: `2026-10-0${id}T09:00:00Z`,
  folder: 'inbox',
  category: 'general',
  state: 'open',
  is_read: true,
  is_starred: false,
  is_important: false,
  priority: false,
  account: null,
  sync_issue: null,
  body: '',
  html_body: '',
  attachments: [],
  ...more,
});

const thread: MailThreadDetail = {
  thread_id: 't1',
  subject: 'Renewal quote',
  labels: [RENEWALS],
  account: null,
  sync_issue: null,
  truncated: false,
  messages: [message(1, { is_starred: true }), message(2), message(3, { is_read: false })],
};

describe('patchOfOp (contract §3)', () => {
  it.each([
    ['read', { is_read: true }],
    ['unread', { is_read: false }],
    ['star', { is_starred: true }],
    ['unstar', { is_starred: false }],
    ['archive', { state: 'done' }],
    ['inbox', { state: 'open' }],
    ['mute', { state: 'muted' }],
    ['unmute', { state: 'open' }],
    ['trash', { trashed: true }],
    ['untrash', { trashed: false }],
    ['spam', { spam: true }],
    ['not_spam', { spam: false }],
  ] as const)('%s is the PATCH %j', (op, patch) => {
    expect(patchOfOp(op, null)).toEqual(patch);
  });

  it('carries the label for label_add and label_remove', () => {
    expect(patchOfOp('label_add', 7)).toEqual({ add_labels: [7] });
    expect(patchOfOp('label_remove', 7)).toEqual({ remove_labels: [7] });
  });
});

describe('leavesView', () => {
  const inbox = { folder: 'inbox' as const, label: null };
  it('takes done, muted, deleted and spam out of the Inbox, and keeps read or starred', () => {
    expect(leavesView(inbox, { state: 'done' })).toBe(true);
    expect(leavesView(inbox, { state: 'muted' })).toBe(true);
    expect(leavesView(inbox, { trashed: true })).toBe(true);
    expect(leavesView(inbox, { spam: true })).toBe(true);
    expect(leavesView(inbox, { is_read: true })).toBe(false);
    expect(leavesView(inbox, { is_starred: true })).toBe(false);
  });

  it('takes restored mail out of Trash, not-spam out of Spam, and Inbox out of Done', () => {
    expect(leavesView({ folder: 'trash', label: null }, { trashed: false })).toBe(true);
    expect(leavesView({ folder: 'trash', label: null }, { trashed: true })).toBe(false);
    expect(leavesView({ folder: 'spam', label: null }, { spam: false })).toBe(true);
    expect(leavesView({ folder: 'done', label: null }, { state: 'open' })).toBe(true);
    expect(leavesView({ folder: 'muted', label: null }, { state: 'open' })).toBe(true);
  });

  it('takes an unstarred conversation out of Starred, and a removed label out of its view', () => {
    expect(leavesView({ folder: 'starred', label: null }, { is_starred: false })).toBe(true);
    expect(leavesView({ folder: 'all', label: 7 }, { remove_labels: [7] })).toBe(true);
    expect(leavesView({ folder: 'all', label: 7 }, { remove_labels: [9] })).toBe(false);
    expect(leavesView({ folder: 'all', label: 7 }, { state: 'done' })).toBe(false);
  });
});

describe('patchRow', () => {
  it('reads and unreads the whole conversation', () => {
    expect(patchRow(row, { is_read: true }, KNOWN)).toMatchObject({ is_read: true, unread_count: 0 });
    expect(patchRow({ ...row, is_read: true, unread_count: 0 }, { is_read: false }, KNOWN)).toMatchObject({ is_read: false, unread_count: 3 });
  });

  it('adds known labels by name order, removes others, and never touches the original', () => {
    const next = patchRow(row, { add_labels: [11, 12], remove_labels: [7] }, KNOWN);
    expect(next.labels.map((l) => l.name)).toEqual(['Pilot', 'Q4']);
    expect(next.labels[0].pending).toBe(true);
    expect(row.labels).toEqual([RENEWALS]);
  });

  it('ignores a label it does not know', () => {
    expect(patchRow(row, { add_labels: [99] }, KNOWN).labels).toEqual([RENEWALS]);
  });
});

describe('patchThread', () => {
  it('stars the newest message only, and unstars every one (contract decision 10)', () => {
    expect(patchThread(thread, { is_starred: true }, KNOWN).messages.map((m) => m.is_starred)).toEqual([true, false, true]);
    expect(patchThread(thread, { is_starred: false }, KNOWN).messages.map((m) => m.is_starred)).toEqual([false, false, false]);
  });

  it('reads every message, and labels the thread and each message', () => {
    const read = patchThread(thread, { is_read: true }, KNOWN);
    expect(read.messages.every((m) => m.is_read)).toBe(true);
    const labelled = patchThread(thread, { add_labels: [11] }, KNOWN);
    expect(labelled.labels.map((l) => l.name)).toEqual(['Q4', 'Renewals']);
    expect(labelled.messages.every((m) => m.labels.some((l) => l.id === 11))).toBe(true);
  });
});

describe('labelState', () => {
  it('is all, some or none over what holds the labels', () => {
    const holders = [{ labels: [RENEWALS] }, { labels: [RENEWALS, Q4] }];
    expect(labelState(holders, 7)).toBe('all');
    expect(labelState(holders, 11)).toBe('some');
    expect(labelState(holders, 12)).toBe('none');
    expect(labelState([], 7)).toBe('none');
  });
});

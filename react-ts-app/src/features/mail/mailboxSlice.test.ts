import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import mailboxReducer, {
  buildListPath,
  bulkMailAction,
  createMailLabel,
  fetchMailLabels,
  fetchMailList,
  fetchThread,
  rowOfMessage,
  selectThread,
  setMailFolder,
  setMailLabel,
  toggleChecked,
  updateThread,
} from './mailboxSlice';
import type { MailQuery } from './mailboxSlice';
import { D2_MESSAGES, MAIL_EARLIER, stubMail } from './testMail';
import { TWO_WAY_OFF_TEXT } from './mailText';
import { calls, sent } from '../agents/testAgents';

// Integration tier: the slice's thunks against the contract-shaped stub
// (D2 contract §2 to §4), the store real, only fetch stubbed.

afterEach(() => {
  vi.unstubAllGlobals();
});

const INBOX: MailQuery = { folder: 'inbox', label: null, category: null, unread: false, priority: false };
const makeStore = () => configureStore({ reducer: { mailbox: mailboxReducer } });

describe('buildListPath and rowOfMessage (Decision 1)', () => {
  it('lists conversations, and Sent and Drafts as messages', () => {
    expect(buildListPath(INBOX)).toBe('/mail/threads/');
    expect(buildListPath({ ...INBOX, folder: 'all', label: 7 })).toBe('/mail/threads/?folder=all&label=7');
    expect(buildListPath({ ...INBOX, category: 'financial', unread: true })).toBe('/mail/threads/?category=financial&unread=true');
    expect(buildListPath({ ...INBOX, folder: 'sent' })).toBe('/mail/messages/?folder=sent');
    expect(buildListPath({ ...INBOX, folder: 'drafts' })).toBe('/mail/messages/?folder=drafts');
  });

  it('reads a sent message as a row addressed to its recipients', () => {
    expect(rowOfMessage(MAIL_EARLIER)).toMatchObject({
      id: 3,
      sent: true,
      message_count: 1,
      unread_count: 0,
      last_sent_at: MAIL_EARLIER.sent_at,
      participants: [{ name: 'Ann Lee', address: 'ann@pizzahut.com' }],
    });
  });
});

describe('mailbox slice against the stub', () => {
  it('reads conversations, then one conversation oldest first', async () => {
    stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    const rows = store.getState().mailbox.list!.results;
    expect(rows.map((r) => r.id)).toEqual([1, 4]);
    expect(rows[0]).toMatchObject({ message_count: 2, unread_count: 1, participants: [{ name: 'Dana Ruiz' }, { name: 'Ann Lee' }] });
    store.dispatch(selectThread(1));
    await store.dispatch(fetchThread(1));
    expect(store.getState().mailbox.thread!.messages.map((m) => m.id)).toEqual([3, 1]);
  });

  it('marks a conversation read before the server answers, and forgets the undo after', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    const pending = store.dispatch(updateThread({ id: 1, patch: { is_read: true } }));
    expect(store.getState().mailbox.list!.results[0]).toMatchObject({ is_read: true, unread_count: 0 });
    await pending;
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ is_read: true }]);
    expect(store.getState().mailbox.undo).toEqual({});
  });

  it('takes an archived conversation out of the Inbox at once, and puts it back where it was when refused', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    state.failNext = { status: 409, body: { code: 'TWO_WAY_OFF', detail: TWO_WAY_OFF_TEXT, needs_reconnect: true } };
    const pending = store.dispatch(updateThread({ id: 1, patch: { state: 'done' } }));
    expect(store.getState().mailbox.list!.results.map((r) => r.id)).toEqual([4]);
    expect(store.getState().mailbox.list!.count).toBe(1);
    await pending;
    expect(store.getState().mailbox.list!.results.map((r) => r.id)).toEqual([1, 4]);
    expect(store.getState().mailbox.list!.count).toBe(2);
    expect(store.getState().mailbox.actionError).toEqual({ text: TWO_WAY_OFF_TEXT, reconnect: true, code: 'TWO_WAY_OFF' });
  });

  it('stars only the newest message of the open conversation (contract decision 10)', async () => {
    stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    store.dispatch(selectThread(1));
    await store.dispatch(fetchThread(1));
    const pending = store.dispatch(updateThread({ id: 1, patch: { is_starred: true } }));
    expect(store.getState().mailbox.thread!.messages.map((m) => m.is_starred)).toEqual([false, true]);
    await pending;
    expect(store.getState().mailbox.thread!.messages.map((m) => m.is_starred)).toEqual([false, true]);
  });

  it('sends a bulk action as thread_of, applies it at once and clears the ticks', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    store.dispatch(toggleChecked(1));
    store.dispatch(toggleChecked(4));
    const pending = store.dispatch(bulkMailAction({ op: 'trash', ids: [1, 4] }));
    expect(store.getState().mailbox.list!.results).toEqual([]);
    expect(store.getState().mailbox.bulkBusy).toBe(true);
    await pending;
    expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'trash', thread_of: [1, 4] }]);
    expect(store.getState().mailbox.checked).toEqual([]);
    expect(store.getState().mailbox.bulkBusy).toBe(false);
  });

  it('opens a label view on folder=all&label=, and reads the labels with their unread counts', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    store.dispatch(setMailLabel(7));
    const { folder, label, category, unread, priority } = store.getState().mailbox;
    expect([folder, label]).toEqual(['all', 7]);
    await store.dispatch(fetchMailList({ folder, label, category, unread, priority }));
    expect(calls(spy, 'GET', '/mail/threads/')).toEqual(['/mail/threads/?folder=all&label=7']);
    expect(store.getState().mailbox.list!.results.map((r) => r.id)).toEqual([1]);
    await store.dispatch(fetchMailLabels());
    expect(store.getState().mailbox.labels.find((l) => l.id === 7)).toMatchObject({ name: 'Renewals', unread: 1, pending: false });
  });

  it('creates a pending label; a name that exists answers with that label (LABEL_EXISTS)', async () => {
    stubMail();
    const store = makeStore();
    await store.dispatch(fetchMailLabels());
    const made = await store.dispatch(createMailLabel('Pilot'));
    expect(made.payload).toMatchObject({ id: 12, label: { name: 'Pilot', pending: true, gmail_id: null } });
    expect(store.getState().mailbox.labels.map((l) => l.name)).toEqual(['Pilot', 'Q4', 'Renewals', 'Vendors/Billing']);
    const again = await store.dispatch(createMailLabel('renewals'));
    expect(again.payload).toEqual({ id: 7, label: null });
  });

  it("refuses a blank label name in the server's words", async () => {
    stubMail();
    const store = makeStore();
    const refused = await store.dispatch(createMailLabel('   '));
    expect(refused.payload).toEqual({ text: 'Name the label.', reconnect: false, code: null });
  });
});

describe('a list answer for a view the person has left', () => {
  it('never shows under the new view, nor touches its loading or error', async () => {
    stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    store.dispatch(setMailFolder('sent'));
    await store.dispatch(fetchMailList({ ...INBOX, folder: 'sent' }));
    const sentRows = store.getState().mailbox.list!.results.map((r) => r.id);
    expect(sentRows).toEqual([3]);
    // The inbox request, started before the switch, answers last.
    const stale = store.dispatch(fetchMailList(INBOX));
    expect(store.getState().mailbox.loading).toBe(false);
    await stale;
    expect(store.getState().mailbox.list!.results.map((r) => r.id)).toEqual(sentRows);
    expect(store.getState().mailbox.loading).toBe(false);
    expect(store.getState().mailbox.error).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import { selectThread } from '../../features/mail/mailboxSlice';
import { notificationAdded } from '../../features/notifications/notificationsSlice';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, GOOGLE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { TWO_WAY_OFF_TEXT } from '../../features/mail/mailText';
import { calls, sent } from '../../features/agents/testAgents';

// Integration tier: two-way Gmail D2 in the real page and store; only
// fetch is stubbed, with the D2 contract's shapes (stubMail).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderMailbox(url = '/communications?source=mailbox:google') {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/communications" element={<CommunicationsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

/** Opens Ann's conversation once the connection (the action gate) is read. */
async function openAnn(store: ReturnType<typeof renderMailbox>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
  const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
  await within(pane).findByRole('article', { name: /^Ann Lee, / });
  return { mailbox, pane };
}

describe('Gmail labels (D2 contract §4)', () => {
  it('lists labels in the sidebar with their unread conversations, and opens a label view', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const group = await within(mailbox).findByRole('region', { name: 'Labels' });
    const renewals = await within(group).findByRole('button', { name: /^Renewals/ });
    expect(renewals).toHaveTextContent('1');
    await userEvent.click(renewals);
    await waitFor(() => expect(calls(spy, 'GET', '/mail/threads/')).toContain('/mail/threads/?folder=all&label=7'));
    expect(within(mailbox).getByRole('heading', { level: 2, name: 'Renewals' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /^Renewals/ })).toHaveAttribute('aria-current', 'page');
  });

  it('applies and removes a label on the conversation, and creates one that is not in Gmail yet', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const { mailbox, pane } = await openAnn(store);
    await userEvent.click(await within(pane).findByRole('button', { name: 'Labels' }));
    const menu = screen.getByRole('dialog', { name: 'Labels' });
    const q4 = within(menu).getByRole('checkbox', { name: /Q4/ }) as HTMLInputElement;
    expect(q4.indeterminate).toBe(true);
    await userEvent.click(q4);
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ add_labels: [11] }));
    await waitFor(() => expect(within(menu).getByRole('checkbox', { name: /Q4/ })).toBeChecked());
    await userEvent.click(within(menu).getByRole('checkbox', { name: /Q4/ }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ remove_labels: [11] }));
    await userEvent.type(within(menu).getByLabelText('New label'), 'Pilot');
    await userEvent.click(within(menu).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(sent(spy, 'POST', '/mail/labels/')).toEqual([{ name: 'Pilot' }]));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ add_labels: [12] }));
    const sidebar = within(mailbox).getByRole('region', { name: 'Labels' });
    expect(within(sidebar).getByRole('button', { name: /^Pilot/ })).toHaveAttribute('title', 'Not in Gmail yet');
  });
});

describe("Gmail's own actions (D2 contract §3)", () => {
  it('deletes, restores from Trash, and reports spam', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const { mailbox, pane } = await openAnn(store);
    await userEvent.click(await within(pane).findByRole('button', { name: 'Delete' }));
    expect(await within(mailbox).findByRole('region', { name: 'Mail' })).toBeInTheDocument();
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ trashed: true }));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeNull());

    await userEvent.click(within(mailbox).getByRole('button', { name: 'Trash' }));
    await userEvent.click(await within(mailbox).findByRole('button', { name: /Ann Lee/ }));
    const trashed = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(trashed).findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ trashed: false }));

    await userEvent.click(within(mailbox).getByRole('button', { name: /^Inbox/ }));
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
    const again = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(again).findByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Report spam' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ spam: true }));
  });

  it("hides Gmail's own actions and the labels for Outlook", async () => {
    stubMail({ connection: OUTLOOK, labels: [], messages: D2_MESSAGES });
    const store = renderMailbox('/communications?source=mailbox:microsoft');
    const { mailbox, pane } = await openAnn(store);
    expect(store.getState().mail.connection?.provider).toBe('microsoft');
    expect(within(pane).getByRole('button', { name: 'Mark done' })).toBeEnabled();
    expect(within(pane).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'Labels' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(within(mailbox).queryByRole('region', { name: 'Labels' })).toBeNull();
  });
});

describe('Bulk select (spec §4)', () => {
  it('ticks conversations, marks them read in one request, then deletes every one on the page', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select Dana Ruiz, Ann Lee' }));
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(bar).toHaveTextContent('2 selected');
    await userEvent.click(within(bar).getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'read', thread_of: [1, 4] }]));
    await waitFor(() => expect(bar).not.toHaveTextContent('selected'));
    await userEvent.click(within(bar).getByRole('checkbox', { name: 'Select every conversation on this page' }));
    await userEvent.click(await within(bar).findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent(spy, 'POST', '/mail/actions/')).toContainEqual({ op: 'trash', thread_of: [1, 4] }));
    expect(await within(mailbox).findByText('Inbox zero')).toBeInTheDocument();
  });

  it('labels the selection, mixed where only some carry the label', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select every conversation on this page' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    await userEvent.click(await within(bar).findByRole('button', { name: 'Label' }));
    const renewals = screen.getByRole('checkbox', { name: /Renewals/ }) as HTMLInputElement;
    expect(renewals.indeterminate).toBe(true);
    await userEvent.click(renewals);
    await waitFor(() => expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'label_add', thread_of: [1, 4], label_id: 7 }]));
  });

  it('keeps the selection actions off while two-way is off, with the reason', async () => {
    stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, two_way: false } });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection?.two_way).toBe(false));
    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(within(bar).getByRole('button', { name: 'Mark done' })).toBeDisabled();
    expect(within(bar).getByRole('button', { name: 'Mark done' })).toHaveAttribute('title', TWO_WAY_OFF_TEXT);
    expect(within(bar).getByRole('button', { name: 'Clear' })).toBeEnabled();
  });

  it('offers no Delete or Label to an Outlook selection', async () => {
    stubMail({ connection: OUTLOOK, labels: [], messages: D2_MESSAGES });
    const store = renderMailbox('/communications?source=mailbox:microsoft');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection?.provider).toBe('microsoft'));
    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(within(bar).getByRole('button', { name: 'Mark done' })).toBeEnabled();
    expect(within(bar).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Label' })).toBeNull();
  });
});

describe('Keyboard (Decision 8)', () => {
  it('j and k move through the list; e marks the focused one done and the next takes its place', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.keyboard('j');
    expect(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toHaveFocus();
    await userEvent.keyboard('j');
    expect(within(mailbox).getByRole('button', { name: 'Circleback' })).toHaveFocus();
    await userEvent.keyboard('k');
    expect(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toHaveFocus();
    await userEvent.keyboard('e');
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ state: 'done' }]));
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Circleback' })).toHaveFocus());
  });

  it('opens with Enter, r opens the reply, keys never act in the composer, and # deletes the open conversation', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.keyboard('jj{Enter}');
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByRole('heading', { level: 2, name: 'Invoice 1042' });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('r');
    const composer = await within(mailbox).findByRole('region', { name: 'Reply' });
    (await within(composer).findByRole('button', { name: 'Add Bcc' })).focus();
    await userEvent.keyboard('e#');
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
    await userEvent.click(within(composer).getByRole('button', { name: 'Back' }));
    await within(mailbox).findByRole('region', { name: 'Conversation' });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('#');
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ trashed: true }]));
    expect(await within(mailbox).findByRole('region', { name: 'Mail' })).toBeInTheDocument();
  });

  it('with a conversation open, k on the first row and j on the last do nothing', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.keyboard('j{Enter}');
    let pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByRole('heading', { level: 2, name: 'Renewal quote' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const before = [calls(spy, 'GET', '/thread/').length, sent(spy, 'PATCH', '/thread/').length];
    await userEvent.keyboard('k');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect([calls(spy, 'GET', '/thread/').length, sent(spy, 'PATCH', '/thread/').length]).toEqual(before);
    expect(within(mailbox).getByRole('heading', { level: 2, name: 'Renewal quote' })).toBeInTheDocument();

    await userEvent.keyboard('j');
    pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByRole('heading', { level: 2, name: 'Invoice 1042' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const atLast = [calls(spy, 'GET', '/thread/').length, sent(spy, 'PATCH', '/thread/').length];
    await userEvent.keyboard('j');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect([calls(spy, 'GET', '/thread/').length, sent(spy, 'PATCH', '/thread/').length]).toEqual(atLast);
    expect(within(mailbox).getByRole('heading', { level: 2, name: 'Invoice 1042' })).toBeInTheDocument();
  });

  it('j and k do nothing when the open conversation is not on this page', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    act(() => {
      store.dispatch(selectThread(99999));
    });
    await within(mailbox).findByRole('region', { name: 'Conversation' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const before = [calls(spy, 'GET', '/thread/').length, sent(spy, 'PATCH', '/thread/').length];
    await userEvent.keyboard('jk');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store.getState().mailbox.selectedId).toBe(99999);
    expect([calls(spy, 'GET', '/thread/').length, sent(spy, 'PATCH', '/thread/').length]).toEqual(before);
  });
});

describe('Failure notices (D2 contract §5)', () => {
  const ISSUE = { text: "Couldn't archive in Gmail: the message no longer exists.", at: '2026-10-11T08:50:02Z' };

  it('opens the conversation the bell links to, with the change that did not reach Gmail', async () => {
    stubMail({ messages: D2_MESSAGES.map((m) => (m.id === 1 ? { ...m, sync_issue: ISSUE } : m)) });
    renderMailbox('/communications?source=mailbox:google&message=1');
    const pane = await screen.findByRole('region', { name: 'Conversation' });
    expect(await within(pane).findByText(ISSUE.text)).toBeInTheDocument();
  });

  it('reads the list and the open conversation again when a mail_action_failed notice arrives', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    await openAnn(store);
    const lists = calls(spy, 'GET', '/mail/threads/').length;
    const threads = calls(spy, 'GET', '/thread/').length;
    act(() => {
      store.dispatch(
        notificationAdded({ id: 40, kind: 'mail_action_failed', message: ISSUE.text, link: '/communications?source=mailbox:google&message=1', actor: null, is_read: false, created_at: ISSUE.at }),
      );
    });
    await waitFor(() => expect(calls(spy, 'GET', '/mail/threads/').length).toBe(lists + 1));
    await waitFor(() => expect(calls(spy, 'GET', '/thread/').length).toBe(threads + 1));
  });
});

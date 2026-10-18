import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../store';
import CommunicationsPage from '../pages/communications/CommunicationsPage';
import { GmailAccountRow } from '../components/integrations/GmailAccountRow';
import { D2_MESSAGES, stubMail } from '../features/mail/testMail';
import { RECONNECT_TWO_WAY, TWO_WAY_OFF_TEXT } from '../features/mail/mailText';
import { forgetInlineImages } from '../features/mail/mailAttachments';
import { calls, sent } from '../features/agents/testAgents';

// End-to-end tier (jsdom, no browser; .claude/skills/testing): two-way
// Gmail delivery 2 through the real routes, store and pages. Only fetch is
// stubbed, with the D2 contract's shapes (stubMail).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

function app(url: string) {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/communications" element={<CommunicationsPage />} />
          <Route path="/settings/connections" element={<ul>
                <GmailAccountRow />
              </ul>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

async function mailboxReady(store: ReturnType<typeof app>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  return mailbox;
}

describe('Two-way Gmail D2 journeys', () => {
  it('reads a conversation, unfolds the older message, marks it done and finds it in Done', { timeout: 30000 }, async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = app('/communications?source=mailbox:google');
    const mailbox = await mailboxReady(store);
    const row = await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' });
    expect(row.closest('li')).toHaveTextContent('2 messages');
    await userEvent.click(row);
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await waitFor(() => expect(sent(spy, 'PATCH', '/mail/messages/1/thread/')).toEqual([{ is_read: true }]));
    await userEvent.click(await within(pane).findByRole('button', { name: /You.*Could you send the renewal quote\?/ }));
    expect(within(pane).getByRole('article', { name: /^You, / })).toHaveTextContent('Could you send the renewal quote?');
    await userEvent.click(within(pane).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/mail/messages/1/thread/')).toEqual([{ is_read: true }, { state: 'done' }]));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeNull());
    await userEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Done/ }));
    expect(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
  });

  it('labels a conversation with a new label and finds it in that label', { timeout: 30000 }, async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = app('/communications?source=mailbox:google');
    const mailbox = await mailboxReady(store);
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(pane).findByRole('button', { name: 'Labels' }));
    const menu = screen.getByRole('dialog', { name: 'Labels' });
    await userEvent.type(within(menu).getByLabelText('New label'), 'Pilot');
    await userEvent.click(within(menu).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ add_labels: [12] }));
    await waitFor(() => expect(within(pane).getAllByRole('group', { name: /Pilot/ }).length).toBeGreaterThan(0));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(mailbox).getByRole('button', { name: /^Inbox$/ }));
    const sidebar = within(mailbox).getByRole('region', { name: 'Labels' });
    await userEvent.click(within(sidebar).getByRole('button', { name: /^Pilot/ }));
    await waitFor(() => expect(calls(spy, 'GET', '/mail/threads/')).toContain('/mail/threads/?folder=all&label=12'));
    expect(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
    expect(within(mailbox).queryByRole('button', { name: 'Circleback' })).toBeNull();
  });

  it('a bulk delete Gmail can no longer take comes back, says why, and leads to Connections', { timeout: 30000 }, async () => {
    const { state, spy } = stubMail({ messages: D2_MESSAGES });
    const store = app('/communications?source=mailbox:google');
    const mailbox = await mailboxReady(store);
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select every conversation on this page' }));
    // The workspace's grant changed under the screen.
    state.connection = { ...state.connection!, two_way: false, needs_reconnect: true };
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Delete' }));
    const alert = await within(mailbox).findByRole('alert');
    expect(alert).toHaveTextContent(TWO_WAY_OFF_TEXT);
    expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'trash', thread_of: [1, 4] }]);
    expect(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('button', { name: 'Circleback' })).toBeInTheDocument();
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Mark done' })).toBeDisabled());
    await userEvent.click(within(alert).getByRole('link', { name: 'Open Connections' }));
    expect(await screen.findByText(RECONNECT_TWO_WAY)).toBeInTheDocument();
  });

  it('opens what the bell links to, shows what did not reach Gmail, previews the PDF, and e marks it done', { timeout: 30000 }, async () => {
    const issue = { text: "Couldn't archive in Gmail: the message no longer exists.", at: '2026-10-11T08:50:02Z' };
    const { state, spy } = stubMail({ messages: D2_MESSAGES.map((m) => (m.id === 1 ? { ...m, sync_issue: issue } : m)) });
    state.attachmentRefusals[33] = { status: 413, body: { code: 'ATTACHMENT_TOO_LARGE', detail: 'This file is too large to open here. Open it in Gmail.' } };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const store = app('/communications?source=mailbox:google&message=1');
    const mailbox = await mailboxReady(store);
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    const newest = await within(pane).findByRole('article', { name: /^Ann Lee, / });
    expect(within(newest).getByText(issue.text)).toBeInTheDocument();
    await waitFor(() => expect(within(newest).getByTitle('Message: Renewal quote').getAttribute('srcdoc')).toContain('data:image/png;base64,'));
    await userEvent.click(within(newest).getByRole('button', { name: /Pricing\.zip/ }));
    expect(await within(newest).findByRole('alert')).toHaveTextContent('This file is too large to open here. Open it in Gmail.');
    const pdf = within(newest).getByRole('button', { name: /Renewal quote\.pdf/ });
    await userEvent.click(pdf);
    const viewer = await screen.findByRole('dialog', { name: 'Renewal quote.pdf' });
    expect(viewer.querySelector('object')).toHaveAttribute('data', 'blob:preview');
    await userEvent.keyboard('e');
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Renewal quote.pdf' })).toBeNull();
    expect(pdf).toHaveFocus();
    await userEvent.keyboard('e');
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ state: 'done' }]));
    expect(await within(mailbox).findByRole('region', { name: 'Mail' })).toBeInTheDocument();
  });
});

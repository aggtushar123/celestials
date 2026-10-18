import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, GMAIL_OLD, GOOGLE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import { calls } from '../../features/agents/testAgents';

// Integration tier: the mailbox search and "Search older mail in Gmail"
// (contract §6, decision 28; Decision 12).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
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

async function searchFor(text: string, url?: string) {
  const store = renderMailbox(url);
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await within(mailbox).findByRole('button', { name: 'Circleback' });
  await userEvent.type(within(mailbox).getByRole('searchbox', { name: 'Search your mail' }), text);
  await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'Circleback' })).not.toBeInTheDocument());
  return mailbox;
}

const older = Array.from({ length: 25 }, (_, i) => ({ ...GMAIL_OLD, id: 600 + i, thread_id: `g-${i}`, subject: `Old renewal ${i}` }));

describe('Search, and Search older mail in Gmail (two-way Gmail D3)', () => {
  it('narrows the synced mail by q, then runs it in Gmail: held results marked, an older one stored when opened', async () => {
    const { spy, state } = stubMail({ messages: D2_MESSAGES, gmailOnly: [GMAIL_OLD] });
    const mailbox = await searchFor('renewal');
    expect(calls(spy, 'GET', '/mail/threads/').some((call) => call.includes('q=renewal'))).toBe(true);
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Search older mail in Gmail' }));
    const results = await within(mailbox).findByRole('region', { name: 'Results from Gmail' });
    const rows = await within(results).findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(results).toHaveTextContent('About 3 in Gmail');
    expect(rows[0]).toHaveTextContent('In Revenact');
    expect(rows[2]).toHaveTextContent('2024 renewal');
    expect(rows[2]).not.toHaveTextContent('In Revenact');
    expect(calls(spy, 'GET', '/mail/gmail/search/')).toEqual(['/mail/gmail/search/?q=renewal']);
    await userEvent.click(within(rows[2]).getByRole('button'));
    const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
    expect(await within(conversation).findByRole('heading', { level: 2, name: '2024 renewal' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/gmail/search/open/')).toHaveLength(1);
    expect(state.messages.some((m) => m.id === GMAIL_OLD.id)).toBe(true);
    // Back (named after the folder) returns to the Gmail results.
    await userEvent.click(within(within(mailbox).getByRole('region', { name: 'Reading' })).getByRole('button', { name: 'Inbox' }));
    expect(await within(mailbox).findByRole('region', { name: 'Results from Gmail' })).toBeInTheDocument();
  });

  it('opens a held result without storing it, and More from Gmail reads 20 more', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES, gmailOnly: older });
    const mailbox = await searchFor('renewal');
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Search older mail in Gmail' }));
    const results = await within(mailbox).findByRole('region', { name: 'Results from Gmail' });
    expect(await within(results).findAllByRole('listitem')).toHaveLength(20);
    await userEvent.click(within(results).getByRole('button', { name: 'More from Gmail' }));
    await waitFor(() => expect(within(results).getAllByRole('listitem')).toHaveLength(27));
    expect(calls(spy, 'GET', '/mail/gmail/search/').at(-1)).toBe('/mail/gmail/search/?q=renewal&page_token=20');
    expect(within(results).queryByRole('button', { name: 'More from Gmail' })).not.toBeInTheDocument();
    await userEvent.click(within(within(results).getAllByRole('listitem')[0]).getByRole('button'));
    expect(await within(mailbox).findByRole('region', { name: 'Conversation' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/gmail/search/open/')).toEqual([]);
  });

  it('a paused mailbox shows the row off with the reason', async () => {
    stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, paused_reason: 'workspace_off' } });
    const paused = await searchFor('renewal');
    const row = within(paused).getByRole('button', { name: 'Search older mail in Gmail' });
    expect(row).toBeDisabled();
    expect(row).toHaveAttribute('title', "Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.");
  });

  it('Outlook has no Gmail row', async () => {
    stubMail({ messages: D2_MESSAGES, connection: OUTLOOK });
    const mailbox = await searchFor('renewal', '/communications?source=mailbox:microsoft');
    expect(within(mailbox).getByRole('searchbox', { name: 'Search your mail' })).toHaveValue('renewal');
    expect(within(mailbox).queryByRole('button', { name: 'Search older mail in Gmail' })).not.toBeInTheDocument();
  });
});

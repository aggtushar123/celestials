import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import type { MailDraft } from '../../features/mail/mailDrafts';
import type { MailMessageDetail } from '../../features/mail/mailboxSlice';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import { calls, sent } from '../../features/agents/testAgents';

// Integration tier: the Drafts folder in D3 (Decision 11, contract
// decision 12): a draft row opens the editor, Delete discards only the
// draft, an agent's draft row says which agent.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

const AGENT_DRAFT: MailDraft = { ...MAIL_DRAFT, id: 56, message_id: 71, thread_id: 't2', to: [['Circleback', 'billing@circleback.ai']], subject: 'Re: Invoice 1042', agent: 'cs', reply_draft_id: 7 };
const AGENT_ROW: MailMessageDetail = { ...MAIL_DRAFT_MESSAGE, id: 71, thread_id: 't2', to: [['Circleback', 'billing@circleback.ai']], subject: 'Re: Invoice 1042', draft: { id: 56, agent: 'cs', reply_draft_id: 7 } };

function renderMailbox(source = 'mailbox:google') {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/communications?source=${source}`]}>
        <Routes>
          <Route path="/communications" element={<CommunicationsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

async function openDrafts(store: ReturnType<typeof renderMailbox>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await userEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Drafts/ }));
  await within(mailbox).findByRole('button', { name: 'To Ann Lee' });
  return mailbox;
}

describe('The Drafts folder (two-way Gmail D3)', () => {
  it('opens a draft row in the composer without marking anything, and names the agent on an agent draft', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE, AGENT_ROW], drafts: [MAIL_DRAFT, AGENT_DRAFT] });
    const mailbox = await openDrafts(renderMailbox());
    expect(within(mailbox).getByRole('button', { name: 'To Circleback' }).closest('li')).toHaveTextContent('CS agent');
    await userEvent.click(within(mailbox).getByRole('button', { name: 'To Ann Lee' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByLabelText('Subject')).toHaveValue('Re: Renewal quote');
    expect(calls(spy, 'GET', '/mail/drafts/55/')).toEqual(['/mail/drafts/55/']);
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
  });

  it('bulk Delete discards only the drafts in one request, and the other bulk actions are not offered', async () => {
    const { spy, state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE, AGENT_ROW], drafts: [MAIL_DRAFT, AGENT_DRAFT] });
    const mailbox = await openDrafts(renderMailbox());
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select To Ann Lee' }));
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select To Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(within(bar).queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: /Mark (read|unread)/ })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Labels' })).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'To Ann Lee' })).not.toBeInTheDocument());
    expect((sent(spy, 'POST', '/mail/drafts/discard/')[0] as { ids: number[] }).ids.sort()).toEqual([55, 56]);
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
    expect(calls(spy, 'POST', '/mail/actions/')).toEqual([]);
    expect(state.messages.some((m) => m.id === 1)).toBe(true);
    expect(await within(mailbox).findByText('Draft discarded.')).toBeInTheDocument();
  });

  it('# discards the focused draft alone; one already gone counts as done (404), a refused bulk puts the rows back and says why', async () => {
    const { spy, state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE, AGENT_ROW], drafts: [MAIL_DRAFT, AGENT_DRAFT] });
    const mailbox = await openDrafts(renderMailbox());
    within(mailbox).getByRole('button', { name: 'To Ann Lee' }).focus();
    await userEvent.keyboard('e');
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([]);
    await userEvent.keyboard('#');
    await waitFor(() => expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual(['/mail/drafts/55/']));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'To Ann Lee' })).not.toBeInTheDocument());
    // Discarded elsewhere meanwhile: a single DELETE answering 404 is done (P6), with no alert.
    state.drafts = [];
    within(mailbox).getByRole('button', { name: 'To Circleback' }).focus();
    await userEvent.keyboard('#');
    await waitFor(() => expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual(['/mail/drafts/55/', '/mail/drafts/56/']));
    expect(within(mailbox).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a bulk discard the server refuses (404, all or nothing) puts the rows back and shows the server words', async () => {
    const { state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE, AGENT_ROW], drafts: [MAIL_DRAFT, AGENT_DRAFT] });
    const mailbox = await openDrafts(renderMailbox());
    state.drafts = [];
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select To Ann Lee' }));
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select To Circleback' }));
    await userEvent.click(within(within(mailbox).getByRole('toolbar', { name: 'Selected conversations' })).getByRole('button', { name: 'Delete' }));
    expect(await within(mailbox).findByRole('alert')).toHaveTextContent('Not found.');
    expect(within(mailbox).getByRole('button', { name: 'To Ann Lee' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('button', { name: 'To Circleback' })).toBeInTheDocument();
  });

  it('in All mail a conversation whose newest message is a draft opens the conversation, with Edit draft on the draft line', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await userEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^All mail/ }));
    const row = await waitFor(() => {
      const li = mailbox.querySelector<HTMLElement>('[data-thread-id="70"]');
      expect(li).not.toBeNull();
      return li as HTMLElement;
    });
    await userEvent.click(within(row).getAllByRole('button')[0]);
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    expect(within(pane).getByRole('button', { name: 'Edit draft' })).toBeInTheDocument();
    expect(within(mailbox).queryByRole('region', { name: 'Reply' })).not.toBeInTheDocument();
    expect(calls(spy, 'GET', '/mail/drafts/55/')).toEqual([]);
  });
});

describe('The Drafts folder on Outlook keeps D2 exactly', () => {
  async function outlookDrafts() {
    const outlookDraft: MailMessageDetail = { ...MAIL_DRAFT_MESSAGE, draft: null };
    const { spy } = stubMail({ connection: { ...OUTLOOK }, messages: [...D2_MESSAGES, outlookDraft] });
    const store = renderMailbox('mailbox:microsoft');
    const mailbox = await openDrafts(store);
    return { spy, mailbox };
  }

  it('the bulk bar keeps Mark done and Mark read, and offers no draft Delete', async () => {
    const { mailbox } = await outlookDrafts();
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select To Ann Lee' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(within(bar).getByRole('button', { name: 'Mark done' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /Mark (read|unread)/ })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('e still marks the focused draft row done', async () => {
    const { spy, mailbox } = await outlookDrafts();
    within(mailbox).getByRole('button', { name: 'To Ann Lee' }).focus();
    await userEvent.keyboard('e');
    await waitFor(() => expect(calls(spy, 'PATCH', '/thread/')).toEqual(['/mail/messages/70/thread/']));
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([]);
  });
});

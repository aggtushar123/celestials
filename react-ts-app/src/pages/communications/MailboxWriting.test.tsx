import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import { calls, sent } from '../../features/agents/testAgents';

// Integration tier: writing from the mailbox (two-way Gmail D3, Decisions
// 2, 3, 13, 14) through the real store, page and routes; fetch and
// XMLHttpRequest are stubbed with the D3 contract's shapes.

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

async function ready(store: ReturnType<typeof renderMailbox>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  return mailbox;
}

const blur = () => (document.activeElement as HTMLElement | null)?.blur();

async function openAnn(mailbox: HTMLElement) {
  await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
  const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
  await within(conversation).findByRole('article', { name: /^Ann Lee, / });
  return conversation;
}

describe('Writing from the mailbox (two-way Gmail D3)', () => {
  it('Compose and c open a new message in the pane; Back with nothing typed returns to the list and stores nothing', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    expect(within(mailbox).getByRole('button', { name: 'Compose' })).toHaveAttribute('aria-keyshortcuts', 'c');
    blur();
    await userEvent.keyboard('c');
    const pane = await within(mailbox).findByRole('region', { name: 'New message' });
    expect(pane).toHaveAttribute('data-mail-composer');
    await waitFor(() => expect(within(pane).getByLabelText('To')).toHaveFocus());
    expect(within(pane).getByLabelText('To')).toHaveValue('');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    expect(await within(mailbox).findByRole('button', { name: 'Circleback' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('Reply saves a draft; Back shows it in the conversation, and Edit draft opens it again', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox());
    const conversation = await openAnn(mailbox);
    expect(within(conversation).queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    const reply = within(conversation).getByRole('button', { name: 'Reply' });
    expect(reply).toHaveAttribute('aria-keyshortcuts', 'r');
    await userEvent.click(reply);
    const pane = await within(mailbox).findByRole('region', { name: 'Reply' });
    await userEvent.type(await within(pane).findByLabelText('Subject'), ' (signed)');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(calls(spy, 'POST', '/mail/drafts/')).toEqual(['/mail/drafts/']));
    const again = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(again).findByRole('button', { name: 'Edit draft' }));
    const reopened = await within(mailbox).findByRole('region', { name: 'Reply' });
    expect(await within(reopened).findByLabelText('Subject')).toHaveValue('Re: Renewal quote (signed)');
  });

  it('a opens Reply all with Cc, f opens Forward with the files, and no key acts inside the composer', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox());
    await openAnn(mailbox);
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ is_read: true }]));
    blur();
    await userEvent.keyboard('a');
    const all = await within(mailbox).findByRole('region', { name: 'Reply all' });
    expect(await within(all).findByRole('list', { name: 'Cc addresses' })).toHaveTextContent('Sam Pizza');
    within(all).getByRole('button', { name: 'Add Bcc' }).focus();
    await userEvent.keyboard('e#jc');
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ is_read: true }]);
    expect(within(mailbox).queryByRole('region', { name: 'New message' })).not.toBeInTheDocument();
    await userEvent.click(within(all).getByRole('button', { name: 'Back' }));
    await within(mailbox).findByRole('region', { name: 'Conversation' });
    blur();
    await userEvent.keyboard('f');
    const forward = await within(mailbox).findByRole('region', { name: 'Forward' });
    expect(await within(forward).findByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    expect(within(forward).getByLabelText('Subject')).toHaveValue('Fwd: Renewal quote');
  });

  it('Outlook keeps the reply box, with no Compose, Reply all or Forward', async () => {
    stubMail({ connection: OUTLOOK, messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox('/communications?source=mailbox:microsoft'));
    const conversation = await openAnn(mailbox);
    expect(within(conversation).getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
    expect(within(conversation).queryByRole('button', { name: 'Reply all' })).not.toBeInTheDocument();
    expect(within(mailbox).queryByRole('button', { name: 'Compose' })).not.toBeInTheDocument();
    blur();
    await userEvent.keyboard('c');
    expect(within(mailbox).queryByRole('region', { name: 'New message' })).not.toBeInTheDocument();
  });

  it('the failure notice link opens that draft in Drafts, not the agent draft panel', async () => {
    stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const store = renderMailbox('/communications?source=mailbox:google&folder=drafts&draft=55');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const pane = await within(mailbox).findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByLabelText('Subject')).toHaveValue('Re: Renewal quote');
    expect(store.getState().mailbox.folder).toBe('drafts');
    expect(screen.queryByRole('region', { name: 'Draft reply' })).not.toBeInTheDocument();
  });

  it('It was sent on an unconfirmed draft closes the composer and reads the mailbox again, as a send does', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [{ ...MAIL_DRAFT, status: 'sent', sending: 'unconfirmed', can_resolve: true }] });
    const store = renderMailbox('/communications?source=mailbox:google&folder=drafts&draft=55');
    const mailbox = await ready(store);
    const pane = await within(mailbox).findByRole('region', { name: 'Reply' });
    const confirm = await within(pane).findByRole('button', { name: 'It was sent' });
    const summaries = calls(spy, 'GET', '/mail/messages/summary/').length;
    await userEvent.click(confirm);
    await waitFor(() => expect(within(mailbox).queryByRole('region', { name: 'Reply' })).not.toBeInTheDocument());
    expect(store.getState().mailbox.compose).toBeNull();
    expect(within(mailbox).getByText('Message sent.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(calls(spy, 'GET', '/mail/messages/summary/').length).toBeGreaterThan(summaries));
  });
});

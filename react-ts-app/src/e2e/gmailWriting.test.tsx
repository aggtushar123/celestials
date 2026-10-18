import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../store';
import CommunicationsPage from '../pages/communications/CommunicationsPage';
import { D2_MESSAGES, GMAIL_OLD, stubMail } from '../features/mail/testMail';
import { forgetInlineImages } from '../features/mail/mailAttachments';
import { calls, sent } from '../features/agents/testAgents';

// End-to-end tier (jsdom, no browser; .claude/skills/testing): two-way
// Gmail delivery 3 through the real routes, store and pages. Only fetch and
// XMLHttpRequest are stubbed, with the D3 contract's shapes (stubMail);
// jsdom has no execCommand, so the document gets a spy.

beforeEach(() => {
  Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

function app(url = '/communications?source=mailbox:google') {
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

async function mailboxReady(store: ReturnType<typeof app>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await within(mailbox).findByRole('button', { name: 'Circleback' });
  return mailbox;
}

const folder = (mailbox: HTMLElement, name: RegExp) => within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name });

describe('Two-way Gmail D3 journeys', () => {
  it('composes a new message with formatting, a file and a chosen record, sends it and finds it in Sent', { timeout: 30000 }, async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await mailboxReady(app());
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Compose' }));
    const pane = await within(mailbox).findByRole('region', { name: 'New message' });
    await userEvent.type(await within(pane).findByLabelText('To'), 'Ann Lee <ann@pizzahut.com>{Enter}');
    await userEvent.type(within(pane).getByLabelText('Subject'), 'Signed renewal');
    const editor = within(pane).getByRole('textbox', { name: 'Message' });
    editor.innerHTML = '<p>Signed copy <strong>attached</strong>.</p>';
    fireEvent.input(editor);
    await userEvent.click(within(within(pane).getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name: 'Italic' }));
    expect(document.execCommand).toHaveBeenCalledWith('italic', false, undefined);
    await userEvent.upload(within(pane).getByLabelText('Choose files to attach'), new File(['signed'], 'Signed.pdf', { type: 'application/pdf' }));
    expect(await within(pane).findByRole('button', { name: 'Remove Signed.pdf' })).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Change' }));
    await userEvent.click(await within(pane).findByRole('button', { name: 'Dough Co' }));
    expect(within(pane).getByText('Filed on Dough Co')).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(await within(mailbox).findByText('Message sent.')).toBeInTheDocument();
    const body = sent(spy, 'POST', '/send/')[0] as Record<string, unknown>;
    expect(body).toMatchObject({ to: [['Ann Lee', 'ann@pizzahut.com']], subject: 'Signed renewal', record: { kind: 'customer', id: 2 } });
    expect(String(body.html)).toContain('<strong>attached</strong>');
    expect(calls(spy, 'POST', '/attachments/')).toHaveLength(1);
    await userEvent.click(folder(mailbox, /^Sent/));
    expect((await within(mailbox).findAllByText(/Signed renewal/)).length).toBeGreaterThan(0);
  });

  it('replies all, takes the Gmail version of a draft edited there, and Delete in Drafts discards only the draft', { timeout: 30000 }, async () => {
    const { spy, state } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await mailboxReady(app());
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
    const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(conversation).findByRole('button', { name: 'Reply all' }));
    const first = await within(mailbox).findByRole('region', { name: 'Reply all' });
    expect(await within(first).findByRole('list', { name: 'Cc addresses' })).toHaveTextContent('Sam Pizza');
    await userEvent.type(within(first).getByLabelText('Subject'), ' (v2)');
    await userEvent.click(within(first).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(state.drafts).toHaveLength(1));
    const draftId = state.drafts[0].id;

    // Back to the list, then Drafts: the row opens the editor on the draft.
    await userEvent.click(within(within(mailbox).getByRole('region', { name: 'Reading' })).getByRole('button', { name: 'Inbox' }));
    await userEvent.click(folder(mailbox, /^Drafts/));
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'To Ann Lee' }));
    const reopened = await within(mailbox).findByRole('region', { name: 'Reply all' });
    expect(await within(reopened).findByLabelText('Subject')).toHaveValue('Re: Renewal quote (v2)');

    // Edited in Gmail meanwhile; the next save is refused and the person takes Gmail's.
    Object.assign(state.drafts[0], { revision: state.drafts[0].revision + 1, html: '<p>Edited in Gmail.</p>', text: 'Edited in Gmail.' });
    await userEvent.type(within(reopened).getByLabelText('Subject'), '!');
    const alert = await within(reopened).findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent('This draft changed in Gmail.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Use the Gmail version' }));
    expect(within(reopened).getByRole('textbox', { name: 'Message' }).innerHTML).toBe('<p>Edited in Gmail.</p>');
    await userEvent.click(within(reopened).getByRole('button', { name: 'Back' }));

    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select To Ann Lee' }));
    await userEvent.click(within(within(mailbox).getByRole('toolbar', { name: 'Selected conversations' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([`/mail/drafts/${draftId}/`]));
    expect(sent(spy, 'PATCH', '/thread/').filter((patch) => 'trashed' in (patch as object))).toEqual([]);
    expect(state.messages.find((m) => m.id === 1)?.folder).toBe('inbox');
  });

  it('searches older mail in Gmail, opens a result, and forwards it with its file', { timeout: 30000 }, async () => {
    const withFile = {
      ...GMAIL_OLD,
      has_attachments: true,
      attachments: [{ id: 801, filename: '2024 quote.pdf', mime_type: 'application/pdf', size: 1000, is_inline: false, content_id: '', available: true, preview: true, download_url: '/api/v1/mail/attachments/801/download/' }],
    };
    const { spy } = stubMail({ messages: D2_MESSAGES, gmailOnly: [withFile] });
    const mailbox = await mailboxReady(app());
    await userEvent.type(within(mailbox).getByRole('searchbox', { name: 'Search your mail' }), '2024');
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Search older mail in Gmail' }));
    const results = await within(mailbox).findByRole('region', { name: 'Results from Gmail' });
    const [row] = await within(results).findAllByRole('listitem');
    await userEvent.click(within(row).getByRole('button'));
    const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(conversation).findByRole('heading', { level: 2, name: '2024 renewal' });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('f');
    const pane = await within(mailbox).findByRole('region', { name: 'Forward' });
    expect(await within(pane).findByRole('list', { name: 'Attachments' })).toHaveTextContent('2024 quote.pdf');
    await userEvent.type(within(pane).getByLabelText('To'), 'ops@doughco.com{Enter}');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(await within(mailbox).findByText('Message sent.')).toBeInTheDocument();
    expect((sent(spy, 'POST', '/mail/drafts/')[0] as Record<string, unknown>).forwarded).toEqual([801]);
  });
});

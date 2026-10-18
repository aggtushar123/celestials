import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailComposer } from './MailComposer';
import type { ComposeTarget } from '../../features/mail/draftSession';
import { D2_MESSAGES, GOOGLE, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, stubMail } from '../../features/mail/testMail';
import { calls } from '../../features/agents/testAgents';

// Integration tier: the composer over a real DraftSession; only fetch and
// XMLHttpRequest are stubbed (stubMail), in the D3 contract's shapes.
// Autosave and the read-again while Gmail saves run after 5 ms here, not 2 s and 3 s.

beforeEach(() => {
  Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  vi.unstubAllGlobals();
});

function compose(target: ComposeTarget) {
  const handlers = { onClose: vi.fn(), onSent: vi.fn(), onDiscarded: vi.fn() };
  render(
    <MemoryRouter>
      <MailComposer target={target} autosaveMs={5} savingPollMs={5} {...handlers} />
    </MemoryRouter>,
  );
  return handlers;
}

function write(editor: HTMLElement, html: string) {
  editor.innerHTML = html;
  fireEvent.input(editor);
}

const withDraft = { messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] };

describe('MailComposer (two-way Gmail D3)', () => {
  it('opens a reply to Ann with the signature in the text, the quote folded and the suggested record', async () => {
    stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'reply', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    const editor = await within(pane).findByRole('textbox', { name: 'Message' });
    expect(within(pane).getByRole('list', { name: 'To addresses' })).toHaveTextContent('Ann Lee');
    expect(within(pane).getByLabelText('Subject')).toHaveValue('Re: Renewal quote');
    expect(editor.innerHTML).toContain('data-revenact-signature');
    expect(pane).toHaveTextContent('From Dana Ruiz <dana@doughco.com>');
    expect(within(pane).getByText('Filed on Pizza Hut')).toBeInTheDocument();
    expect(within(pane).getByText('Suggested from the recipients')).toBeInTheDocument();
    expect(within(pane).queryByTitle('Message: The quoted message')).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Show the quoted message' }));
    expect(within(pane).getByTitle('Message: The quoted message')).toBeInTheDocument();
    expect(within(pane).queryByLabelText('Cc')).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Add Cc' }));
    expect(within(pane).getByLabelText('Cc')).toBeInTheDocument();
  });

  it('saves itself after a change and says it is in Gmail', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'reply', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    write(await within(pane).findByRole('textbox', { name: 'Message' }), '<p>Works for us.</p>');
    await waitFor(() => expect(calls(spy, 'POST', '/mail/drafts/')).toEqual(['/mail/drafts/']));
    expect(await within(pane).findByText('Saved to Gmail')).toBeInTheDocument();
  });

  it('starts a new message in To, and Send with nobody says so before saving anything', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'new' });
    const pane = await screen.findByRole('region', { name: 'New message' });
    await waitFor(() => expect(within(pane).getByLabelText('To')).toHaveFocus());
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(within(pane).getByText('Add someone to send it to.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('sends a draft and hands the answer to the mailbox', async () => {
    const { spy } = stubMail(withDraft);
    const { onSent } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: 55, status: 'sent' })));
    expect(calls(spy, 'POST', '/send/')).toEqual(['/mail/drafts/55/send/']);
  });

  it('tells the mailbox once, even when it re-renders with new handlers', async () => {
    stubMail(withDraft);
    const first = { onClose: vi.fn(), onSent: vi.fn(), onDiscarded: vi.fn() };
    const view = (handlers: typeof first) => (
      <MemoryRouter>
        <MailComposer target={{ kind: 'draft', draftId: 55 }} autosaveMs={5} savingPollMs={5} {...handlers} />
      </MemoryRouter>
    );
    const { rerender } = render(view(first));
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(first.onSent).toHaveBeenCalledTimes(1));
    const second = { onClose: vi.fn(), onSent: vi.fn(), onDiscarded: vi.fn() };
    rerender(view(second));
    rerender(view({ onClose: vi.fn(), onSent: vi.fn(), onDiscarded: vi.fn() }));
    expect(first.onSent).toHaveBeenCalledTimes(1);
    expect(second.onSent).not.toHaveBeenCalled();
  });

  it('discarding tells the mailbox once, even when it re-renders with new handlers', async () => {
    stubMail(withDraft);
    const first = { onClose: vi.fn(), onSent: vi.fn(), onDiscarded: vi.fn() };
    const view = (handlers: typeof first) => (
      <MemoryRouter>
        <MailComposer target={{ kind: 'draft', draftId: 55 }} autosaveMs={5} savingPollMs={5} {...handlers} />
      </MemoryRouter>
    );
    const { rerender } = render(view(first));
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(first.onDiscarded).toHaveBeenCalledTimes(1));
    const second = { onClose: vi.fn(), onSent: vi.fn(), onDiscarded: vi.fn() };
    rerender(view(second));
    expect(first.onDiscarded).toHaveBeenCalledTimes(1);
    expect(second.onDiscarded).not.toHaveBeenCalled();
  });

  it('keeps the draft on a paused mailbox and says why, with the way out', async () => {
    stubMail({ ...withDraft, connection: { ...GOOGLE, paused_reason: 'token_revoked' } });
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    const alert = await within(pane).findByRole('alert');
    expect(alert).toHaveTextContent('Your Gmail connection is paused: Google access was revoked. Reconnect Google in Settings › Connections.');
    expect(within(alert).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
  });

  it('shows the Gmail version on DRAFT_CHANGED, holds Send, and Use the Gmail version replaces the screen', async () => {
    const { state } = stubMail(withDraft);
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    Object.assign(state.drafts[0], { revision: 2, subject: 'Re: Renewal quote (Gmail)', html: '<p>Thursday works.</p>', text: 'Thursday works.' });
    await userEvent.type(within(pane).getByLabelText('Subject'), '!');
    const alert = await within(pane).findByRole('alert');
    expect(alert).toHaveTextContent('This draft changed in Gmail.');
    expect(alert).toHaveTextContent('Thursday works.');
    expect(within(pane).getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.click(within(alert).getByRole('button', { name: 'Use the Gmail version' }));
    expect(within(pane).getByLabelText('Subject')).toHaveValue('Re: Renewal quote (Gmail)');
    expect(within(pane).getByRole('textbox', { name: 'Message' }).innerHTML).toBe('<p>Thursday works.</p>');
    expect(within(pane).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Back while the Gmail change waits keeps the composer open with the choice, losing nothing', async () => {
    const { state } = stubMail(withDraft);
    const { onClose } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    Object.assign(state.drafts[0], { revision: 2, subject: 'Re: Renewal quote (Gmail)' });
    await userEvent.type(within(pane).getByLabelText('Subject'), '!');
    expect(await within(pane).findByRole('alert')).toHaveTextContent('This draft changed in Gmail.');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onClose).not.toHaveBeenCalled();
    expect(within(pane).getByRole('alert')).toHaveTextContent('This draft changed in Gmail.');
    expect(within(pane).getByLabelText('Subject')).toHaveValue('Re: Renewal quote!');
  });

  it('holds the fields while the send is in flight, so nothing typed then is lost', async () => {
    const { spy } = stubMail(withDraft);
    let release = () => {};
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      String(url).includes('/send/') ? new Promise((resolve) => (release = () => resolve(spy(url, init)))) : spy(url, init),
    );
    const { onSent } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    const editor = await within(pane).findByRole('textbox', { name: 'Message' });
    expect(editor).toHaveAttribute('contenteditable', 'true');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    await within(pane).findByRole('button', { name: 'Sending…' });
    expect(editor).toHaveAttribute('contenteditable', 'false');
    expect(within(pane).getByLabelText('Subject')).toBeDisabled();
    expect(within(pane).getByLabelText('To')).toBeDisabled();
    expect(within(pane).getByRole('button', { name: 'Remove ann@pizzahut.com' })).toBeDisabled();
    release();
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it('turns read-only while an unconfirmed send is pending, with the server words', async () => {
    stubMail({ ...withDraft, sendAnswer: { status: 504, body: { code: 'SEND_UNCONFIRMED', detail: "We couldn't confirm this was sent. Check your Sent folder." } } });
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(await within(pane).findByRole('alert')).toHaveTextContent("We couldn't confirm this was sent. Check your Sent folder.");
    await waitFor(() => expect(within(pane).queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument());
    expect(within(pane).getByText('Sending…')).toBeInTheDocument();
    // Pending: the server cannot settle it yet (can_resolve false).
    expect(within(pane).queryByRole('button', { name: 'It was sent' })).not.toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('an unconfirmed draft opens read-only, and It was sent settles it', async () => {
    stubMail({ ...withDraft, drafts: [{ ...MAIL_DRAFT, status: 'sent', sending: 'unconfirmed', can_resolve: true }] });
    const { onSent } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByText("We couldn't confirm this was sent. Check your Sent folder.")).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
    expect(within(pane).queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Reopen draft' })).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'It was sent' }));
    expect(await within(pane).findByText('Message sent.')).toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: 'It was sent' })).not.toBeInTheDocument();
    // Settled as sent: the mailbox closes it and reads again, as after a send.
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: 55, status: 'sent', sending: null }));
  });

  it('a draft already sent opens read-only and does not close itself', async () => {
    stubMail({ ...withDraft, drafts: [{ ...MAIL_DRAFT, status: 'sent', sending: null }] });
    const { onSent } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByText('Message sent.')).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('Reopen draft makes an unconfirmed draft editable again', async () => {
    stubMail({ ...withDraft, drafts: [{ ...MAIL_DRAFT, status: 'sent', sending: 'unconfirmed', can_resolve: true }] });
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await userEvent.click(await within(pane).findByRole('button', { name: 'Reopen draft' }));
    expect(await within(pane).findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('changes the record or files it nowhere', async () => {
    stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'reply', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await userEvent.click(await within(pane).findByRole('button', { name: 'Change' }));
    await userEvent.click(await within(pane).findByRole('button', { name: 'Dough Co' }));
    expect(within(pane).getByText('Filed on Dough Co')).toBeInTheDocument();
    expect(within(pane).queryByText('Suggested from the recipients')).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: "Don't file" }));
    expect(within(pane).getByText('Not filed on a record')).toBeInTheDocument();
  });

  it('keeps an agent draft on its record', async () => {
    stubMail({ ...withDraft, drafts: [{ ...MAIL_DRAFT, agent: 'cs', reply_draft_id: 7 }] });
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByText('An agent draft stays on its record.')).toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it("Back on an unsaved message says so, and the line clears once a later save takes", async () => {
    const { state, spy } = stubMail({ messages: D2_MESSAGES });
    const { onClose } = compose({ kind: 'new' });
    const pane = await screen.findByRole('region', { name: 'New message' });
    state.connection = { ...state.connection!, two_way: false };
    await userEvent.type(within(pane).getByLabelText('Subject'), 'Hello');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    expect(await within(pane).findByText("This message isn't saved yet.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    state.connection = { ...state.connection!, two_way: true };
    await userEvent.type(within(pane).getByLabelText('Subject'), '!');
    await waitFor(() => expect(within(pane).queryByText("This message isn't saved yet.")).not.toBeInTheDocument());
    expect(calls(spy, 'POST', '/mail/drafts/').length).toBeGreaterThan(1);
  });

  it('a forward lists the original files; Back with nothing typed stores nothing', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const { onClose } = compose({ kind: 'forward', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Forward' });
    expect(await within(pane).findByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('a reply opened and closed with Back, nothing typed, stores nothing (Decision 5)', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const { onClose } = compose({ kind: 'reply', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    // The editor is seeded with the signature: seeding is not a change.
    expect((await within(pane).findByRole('textbox', { name: 'Message' })).innerHTML).toContain('data-revenact-signature');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(within(pane).getByRole('status')).toHaveTextContent('');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
    expect(calls(spy, 'PATCH', '/mail/drafts/')).toEqual([]);
  });

  it('attaches a file with its progress, and Discard draft deletes the draft', async () => {
    const { spy } = stubMail(withDraft);
    const { onDiscarded } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await userEvent.upload(await within(pane).findByLabelText('Choose files to attach'), new File(['quote'], 'Quote v2.pdf', { type: 'application/pdf' }));
    expect(await within(pane).findByRole('button', { name: 'Remove Quote v2.pdf' })).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(onDiscarded).toHaveBeenCalled());
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual(['/mail/drafts/55/']);
  });

  it('says it could not start, and tries again', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, two_way: false } });
    compose({ kind: 'new' });
    const pane = await screen.findByRole('region', { name: 'New message' });
    expect(await within(pane).findByRole('alert')).toHaveTextContent("Reconnect Google to turn on two-way: changes here can't reach Gmail yet.");
    state.connection = { ...GOOGLE };
    await userEvent.click(within(pane).getByRole('button', { name: /try again/i }));
    expect(await within(pane).findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });
});

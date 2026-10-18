import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { calls, sent } from '../../features/agents/testAgents';
import { DRAFT_EMAIL, DRAFT_TICKET, stubDrafts } from '../../features/agents/testDrafts';
import type { ReplyDraft, TicketDraftSource } from '../../features/agents/draftTypes';
import { DraftForm } from './DraftForm';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mount = (draft: ReplyDraft) => {
  const onAnswer = vi.fn();
  const onStale = vi.fn();
  const onDiscarded = vi.fn();
  render(
    <MemoryRouter>
      <DraftForm draft={draft} onAnswer={onAnswer} onStale={onStale} onDiscarded={onDiscarded} />
    </MemoryRouter>,
  );
  return { onAnswer, onStale, onDiscarded };
};

describe('DraftForm: an email draft (Decisions 2 to 6)', () => {
  it('shows To as text, Subject and Reply as fields, Send as the one primary', () => {
    stubDrafts();
    mount(DRAFT_EMAIL);
    expect(screen.getByText('Ann Lee <ann@x.com>')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'To' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue('Re: Renewal terms');
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(DRAFT_EMAIL.body);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves only the changed field and says Saved. without moving focus', async () => {
    const { spy } = stubDrafts();
    const { onAnswer } = mount(DRAFT_EMAIL);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Subject' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Subject' }), 'Re: Renewal terms, revised');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalled());
    expect(sent(spy, 'PATCH', '/communications/drafts/7/')).toEqual([{ subject: 'Re: Renewal terms, revised' }]);
    expect(onAnswer.mock.calls[0][0]).toMatchObject({ subject: 'Re: Renewal terms, revised', edited: true });
    expect(onAnswer.mock.calls[0].slice(1)).toEqual(['Saved.', false]);
  });

  it('sends once, with the edits, and hands up the sent draft with focus', async () => {
    const { spy } = stubDrafts();
    const { onAnswer } = mount(DRAFT_EMAIL);
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), ' See you Friday.');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    expect(calls(spy, 'POST', '/send/')).toEqual(['/communications/drafts/7/send/']);
    expect(sent(spy, 'POST', '/send/')).toEqual([{ body: `${DRAFT_EMAIL.body} See you Friday.` }]);
    expect(onAnswer.mock.calls[0][0].status).toBe('sent');
    expect(onAnswer.mock.calls[0].slice(1)).toEqual(['Sent to Ann Lee <ann@x.com>.', true]);
  });

  it('shows a field error under its field, in the server words, and focuses the field', async () => {
    stubDrafts();
    mount(DRAFT_EMAIL);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Reply' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), ' ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const reply = screen.getByRole('textbox', { name: 'Reply' });
    expect(await screen.findByText('Write the reply.')).toBeInTheDocument();
    expect(reply).toHaveAttribute('aria-invalid', 'true');
    expect(reply).toHaveAccessibleDescription('Write the reply.');
    await waitFor(() => expect(reply).toHaveFocus());
  });

  it('says NO_MAILBOX in the server words with a way to Connections, and focuses the alert', async () => {
    stubDrafts({ mailbox: false });
    mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Connect your mailbox to send this.');
    expect(within(alert).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('says a paused Gmail in the server words with the next step and a way to Connections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ code: 'MAILBOX_PAUSED', detail: "Your Gmail connection is paused: your workspace isn't enabled for Gmail.", paused_reason: 'workspace_off' }),
      })),
    );
    mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.");
    expect(within(alert).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
  });

  it("shows the provider's refusal in the server words", async () => {
    stubDrafts({ failNextSend: true });
    mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Your mailbox didn't accept the message. Try again.");
  });

  it('hands ALREADY_SENT to the panel in the server words, with no alert of its own', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, status: 'sent' }] });
    const { onStale } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onStale).toHaveBeenCalledWith('This draft has been sent.'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hands NOT_YOURS to the panel in the server words', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, owner: { id: 3, name: 'Carl CSM' } }] });
    const { onStale } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onStale).toHaveBeenCalledWith('Only Carl CSM can send this draft.'));
  });

  it('saves twice in a row: a save frees the guard', async () => {
    const { spy } = stubDrafts();
    mount(DRAFT_EMAIL);
    const reply = screen.getByRole('textbox', { name: 'Reply' });
    await userEvent.type(reply, ' One.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(spy, 'PATCH', '/communications/drafts/7/')).toHaveLength(1));
    await userEvent.type(reply, ' Two.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(spy, 'PATCH', '/communications/drafts/7/')).toHaveLength(2));
  });

  it('discards after a confirmation, and Cancel keeps it', async () => {
    const { spy } = stubDrafts();
    const { onDiscarded } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this draft?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveFocus();
    expect(calls(spy, 'DELETE', '/communications/drafts/')).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onDiscarded).toHaveBeenCalledTimes(1));
    expect(calls(spy, 'DELETE', '/communications/drafts/')).toEqual(['/communications/drafts/7/']);
  });

  it('hands a Discard refused with ALREADY_SENT to the panel and closes the dialog', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, status: 'sent' }] });
    const { onStale, onDiscarded } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onStale).toHaveBeenCalledWith('This draft has been sent.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDiscarded).not.toHaveBeenCalled();
  });

  it('hands a Discard refused with NOT_YOURS to the panel and closes the dialog', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, owner: { id: 3, name: 'Carl CSM' } }] });
    const { onStale, onDiscarded } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onStale).toHaveBeenCalledWith('Only Carl CSM can change this draft.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDiscarded).not.toHaveBeenCalled();
  });
});

describe('DraftForm: a ticket draft (Decisions 3 to 5)', () => {
  it('has no Subject, says why there is no Send, and copies the reply and opens the source', async () => {
    const user = userEvent.setup();
    stubDrafts();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { onAnswer } = mount(DRAFT_TICKET);
    expect(screen.queryByRole('textbox', { name: 'Subject' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByText('Ticket replies are not sent from Revenact: copy it into the ticket, then mark it as sent.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy and open in Zendesk' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(DRAFT_TICKET, 'Copied the reply.', false));
    await expect(navigator.clipboard.readText()).resolves.toBe(DRAFT_TICKET.body);
    expect(open).toHaveBeenCalledWith('https://acme.zendesk.com/agent/tickets/1042', '_blank', 'noopener,noreferrer');
  });

  it('copies without opening anything for a ticket raised in Revenact', async () => {
    const user = userEvent.setup();
    stubDrafts();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    mount({ ...DRAFT_TICKET, source: { ...(DRAFT_TICKET.source as TicketDraftSource), external_url: null, source_name: null } });
    await user.click(screen.getByRole('button', { name: 'Copy the reply' }));
    await expect(navigator.clipboard.readText()).resolves.toBe(DRAFT_TICKET.body);
    expect(open).not.toHaveBeenCalled();
  });

  it('says a failed copy in a focused alert and reports nothing', async () => {
    const user = userEvent.setup();
    stubDrafts();
    vi.spyOn(window, 'open').mockReturnValue(null);
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
    const { onAnswer } = mount(DRAFT_TICKET);
    await user.click(screen.getByRole('button', { name: 'Copy and open in Zendesk' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not copy the reply. Select it and copy it yourself.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(write).toHaveBeenCalledWith(DRAFT_TICKET.body);
    expect(onAnswer).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('saves an edited reply, then marks it sent', async () => {
    const { spy } = stubDrafts();
    const { onAnswer } = mount(DRAFT_TICKET);
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), ' Thanks.');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as sent' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalled());
    expect(sent(spy, 'PATCH', '/communications/drafts/8/')).toEqual([{ body: `${DRAFT_TICKET.body} Thanks.` }]);
    expect(calls(spy, 'POST', '/mark-sent/')).toEqual(['/communications/drafts/8/mark-sent/']);
    expect(onAnswer.mock.calls[0][0].status).toBe('sent');
    expect(onAnswer.mock.calls[0].slice(1)).toEqual(['Marked as sent.', true]);
  });
});

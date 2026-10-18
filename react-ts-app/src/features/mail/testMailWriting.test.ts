import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/apiClient';
import { calls } from '../agents/testAgents';
import { bodyBytes, D2_MESSAGES, GMAIL_OLD, MAIL_DETAIL, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, OUTLOOK, stubMail } from './testMail';
import type { ComposePrefill, DraftUpload, GmailSearchPage, MailDraft } from './mailDrafts';
import type { MailPage } from './mailboxSlice';

// The stub's own check: the D3 routes answer in the contract's shapes, so
// the screens' tests prove the screens, not a friendlier server.

afterEach(() => vi.unstubAllGlobals());

const seeded = (more: Partial<MailDraft> = {}) => ({ drafts: [{ ...MAIL_DRAFT, ...more }], messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE] });

describe('stubMail, delivery 3', () => {
  it('prefills a reply to Ann with the signature and the quote, and stores nothing', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES });
    const prefill = await apiFetch<ComposePrefill>('/mail/compose/?kind=reply&message=1');
    expect(prefill.to).toEqual([['Ann Lee', 'ann@pizzahut.com']]);
    expect(prefill.subject).toBe('Re: Renewal quote');
    expect(prefill.html).toContain('data-revenact-signature');
    expect(prefill.html).toContain('class="gmail_quote"');
    expect(prefill.record).toEqual({ kind: 'customer', id: 3, name: 'Pizza Hut' });
    expect(state.drafts).toEqual([]);
  });

  it('prefills a forward with the header lines, the files and the byte numbers', async () => {
    stubMail({ messages: D2_MESSAGES });
    const prefill = await apiFetch<ComposePrefill>('/mail/compose/?kind=forward&message=1');
    expect(prefill.to).toEqual([]);
    expect(prefill.subject).toBe('Fwd: Renewal quote');
    expect(prefill.html).toMatch(/<div class="gmail_quote">.*From: Ann Lee &lt;ann@pizzahut\.com&gt;.*Subject: Renewal quote.*To: Dana Ruiz &lt;dana@doughco\.com&gt;.*Cc: Sam Pizza/s);
    expect(prefill.forwarded.map((f) => [f.id, f.origin])).toEqual([[31, 'forward'], [33, 'forward']]);
    // Contract decision 20: the files and the bodies (the html and its text).
    expect(prefill.max_bytes).toBe(26214400);
    expect(prefill.total_bytes).toBeGreaterThanOrEqual(182311 + 24576 + new TextEncoder().encode(prefill.html).length);
    const again = await apiFetch<ComposePrefill>('/mail/compose/?kind=forward&message=3');
    expect(again.subject).toBe('Fwd: Renewal quote');
  });

  it('refuses a prefill the contract refuses', async () => {
    const { state } = stubMail({ ...seeded() });
    await expect(apiFetch('/mail/compose/?kind=reply&message=70')).rejects.toMatchObject({ status: 409, body: { code: 'IS_DRAFT' } });
    await expect(apiFetch('/mail/compose/?kind=reply')).rejects.toMatchObject({ status: 400 });
    await expect(apiFetch('/mail/compose/?kind=reply&message=999')).rejects.toMatchObject({ status: 404 });
    state.connection = { ...OUTLOOK };
    await expect(apiFetch('/mail/compose/?kind=new')).rejects.toMatchObject({ body: { code: 'GMAIL_ONLY' } });
    state.connection = null;
    await expect(apiFetch('/mail/compose/?kind=new')).rejects.toMatchObject({ body: { code: 'NO_MAILBOX' } });
  });

  it('creates a draft that shows in Drafts, and refuses a stale revision with the newest draft', async () => {
    stubMail({ messages: D2_MESSAGES });
    const draft = await apiFetch<MailDraft>('/mail/drafts/', { method: 'POST', body: { kind: 'reply', source_message_id: 1, html: '<p>Works.</p>' } });
    expect(draft.revision).toBe(1);
    const drafts = await apiFetch<MailPage>('/mail/messages/?folder=drafts');
    expect(drafts.results.map((m) => m.draft?.id)).toEqual([draft.id]);
    const saved = await apiFetch<MailDraft>(`/mail/drafts/${draft.id}/`, { method: 'PATCH', body: { subject: 'Re: Quote', revision: 1 } });
    expect(saved.revision).toBe(2);
    await expect(apiFetch(`/mail/drafts/${draft.id}/`, { method: 'PATCH', body: { subject: 'x', revision: 1 } })).rejects.toMatchObject({ status: 409, body: { code: 'DRAFT_CHANGED', draft: { revision: 2 } } });
  });

  it('says saving after a write and saved on the next read, or failed with the sync issue', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES });
    const draft = await apiFetch<MailDraft>('/mail/drafts/', { method: 'POST', body: { kind: 'reply', source_message_id: 1 } });
    expect(draft.gmail.state).toBe('saving');
    expect((await apiFetch<MailDraft>(`/mail/drafts/${draft.id}/`)).gmail.state).toBe('saved');
    const patched = await apiFetch<MailDraft>(`/mail/drafts/${draft.id}/`, { method: 'PATCH', body: { subject: 'Re: x', revision: 1 } });
    expect(patched.gmail.state).toBe('saving');
    state.draftSaveFails = true;
    await apiFetch<MailDraft>(`/mail/drafts/${draft.id}/`, { method: 'PATCH', body: { subject: 'Re: y', revision: 2 } });
    const failed = await apiFetch<MailDraft>(`/mail/drafts/${draft.id}/`);
    expect(failed.gmail.state).toBe('failed');
    expect(failed.sync_issue).toEqual({ text: expect.any(String), at: expect.any(String) });
  });

  it('answers a PATCH that changes nothing without moving the revision', async () => {
    stubMail({ ...seeded() });
    const same = await apiFetch<MailDraft>('/mail/drafts/55/', { method: 'PATCH', body: { subject: 'Re: Renewal quote', revision: 1 } });
    expect(same.revision).toBe(1);
    await expect(apiFetch('/mail/drafts/55/', { method: 'PATCH', body: { subject: 'x' } })).rejects.toMatchObject({ status: 400, body: { revision: ['Send the revision you edited.'] } });
  });

  it('uploads through XMLHttpRequest with progress, and sends the draft into Sent', async () => {
    const { state, spy } = stubMail({ messages: D2_MESSAGES });
    const draft = await apiFetch<MailDraft>('/mail/drafts/', { method: 'POST', body: { kind: 'reply', source_message_id: 1 } });
    const progress: number[] = [];
    const { uploadDraftAttachment } = await import('./mailDrafts');
    const answer = await uploadDraftAttachment(draft.id, new File(['quote'], 'Quote v2.pdf', { type: 'application/pdf' }), (f) => progress.push(f));
    expect(answer).toMatchObject({ attachment: { filename: 'Quote v2.pdf', origin: 'upload' }, revision: 2, total_bytes: 5 + bodyBytes(draft.html, draft.text) });
    expect(progress).toEqual([0.4, 1]);
    expect(calls(spy, 'POST', '/attachments/')).toEqual([`/mail/drafts/${draft.id}/attachments/`]);
    const result = await apiFetch<{ draft: MailDraft; message: { folder: string } }>(`/mail/drafts/${draft.id}/send/`, { method: 'POST', body: { revision: 2 } });
    expect(result.draft.status).toBe('sent');
    expect(result.message.folder).toBe('sent');
    expect(state.messages.find((m) => m.id === draft.message_id)?.draft ?? null).toBeNull();
  });

  it('refuses an upload by type, size and total, and removes one', async () => {
    stubMail({ ...seeded() });
    const { uploadDraftAttachment } = await import('./mailDrafts');
    const up = (file: File) => uploadDraftAttachment(55, file, () => {});
    await expect(up(new File(['x'], 'a.zip'))).rejects.toMatchObject({ status: 400, body: { file: ['.zip is not an accepted file type.'] } });
    await expect(up(new File([], 'a.pdf'))).rejects.toMatchObject({ status: 400, body: { file: ['The file is empty.'] } });
    const big = new File(['x'], 'big.pdf');
    Object.defineProperty(big, 'size', { value: 26_214_401 });
    await expect(up(big)).rejects.toMatchObject({ status: 400, body: { file: ['Files are limited to 25 MB.'] } });
    const added = (await up(new File(['abc'], 'a.pdf'))) satisfies DraftUpload;
    const gone = await apiFetch<{ revision: number; total_bytes: number }>(`/mail/drafts/55/attachments/${added.attachment.id}/`, { method: 'DELETE' });
    expect(gone).toEqual({ revision: 3, total_bytes: bodyBytes(MAIL_DRAFT.html, MAIL_DRAFT.text) });
    await expect(apiFetch('/mail/drafts/55/attachments/12345/', { method: 'DELETE' })).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a send in the contract order: recipients, size, then the connection', async () => {
    const { state } = stubMail({ ...seeded({ to: [] }) });
    state.connection = { ...state.connection!, paused_reason: 'no_seat' };
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 1 } })).rejects.toMatchObject({ status: 400, body: { to: ['Add someone to send it to.'] } });
    state.drafts[0].to = [['Ann Lee', 'ann@pizzahut.com']];
    state.drafts[0].attachments = [{ id: 61, filename: 'Big.pdf', mime_type: 'application/pdf', size: 30_000_000, origin: 'upload', download_url: '' }];
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 1 } })).rejects.toMatchObject({ status: 413, body: { code: 'MESSAGE_TOO_LARGE' } });
    state.drafts[0].attachments = [];
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 1 } })).rejects.toMatchObject({ status: 409, body: { code: 'MAILBOX_PAUSED' } });
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 7 } })).rejects.toMatchObject({ status: 409, body: { code: 'DRAFT_CHANGED' } });
  });

  it('answers the recipients before the record on a send with both wrong', async () => {
    stubMail({ ...seeded({ to: [] }) });
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 1, record: { kind: 'customer', id: 99 } } })).rejects.toMatchObject({ status: 400, body: { to: ['Add someone to send it to.'] } });
    await expect(apiFetch('/mail/drafts/55/', { method: 'PATCH', body: { revision: 1, record: { kind: 'customer', id: 99 } } })).rejects.toMatchObject({ body: { record: ['Choose a record you can open.'] } });
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 1, to: ['ann@pizzahut.com'], record: { kind: 'customer', id: 99 } } })).rejects.toMatchObject({ body: { record: ['Choose a record you can open.'] } });
  });

  it('leaves a send with no answer pending and not resolvable, then settles an unconfirmed one', async () => {
    const { state } = stubMail({ ...seeded() });
    state.sendAnswer = { status: 504, body: { code: 'SEND_UNCONFIRMED', detail: "We couldn't confirm this was sent." } };
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 1 } })).rejects.toMatchObject({ status: 504 });
    expect(state.drafts[0]).toMatchObject({ status: 'sent', sending: 'pending', can_resolve: false, sent_at: null });
    await expect(apiFetch('/mail/drafts/55/', { method: 'PATCH', body: { subject: 'x', revision: 1 } })).rejects.toMatchObject({ status: 409, body: { code: 'ALREADY_SENT' } });
    await expect(apiFetch('/mail/drafts/55/confirm-sent/', { method: 'POST' })).rejects.toMatchObject({ status: 409, body: { code: 'NOT_UNCONFIRMED' } });

    Object.assign(state.drafts[0], { sending: 'unconfirmed', can_resolve: true });
    const reopened = await apiFetch<MailDraft>('/mail/drafts/55/reopen/', { method: 'POST' });
    expect(reopened).toMatchObject({ status: 'open', sending: null, can_resolve: false });
    Object.assign(state.drafts[0], { status: 'sent', sending: 'unconfirmed', can_resolve: true });
    const confirmed = await apiFetch<MailDraft>('/mail/drafts/55/confirm-sent/', { method: 'POST' });
    expect(confirmed).toMatchObject({ status: 'sent', sending: null, can_resolve: false });
    expect(confirmed.sent_at).not.toBeNull();
  });

  it('reopens the draft as local when Gmail no longer has it', async () => {
    const { state } = stubMail({ ...seeded() });
    state.sendAnswer = { status: 409, body: { code: 'DRAFT_GONE', detail: 'This draft was sent or discarded in Gmail. Check Sent before sending it again.' } };
    await expect(apiFetch('/mail/drafts/55/send/', { method: 'POST', body: { revision: 1 } })).rejects.toMatchObject({ status: 409, body: { code: 'DRAFT_GONE' } });
    expect(state.drafts[0]).toMatchObject({ status: 'open', gmail: { state: 'local' } });
  });

  it('discards one draft or many, and applies the delete checks', async () => {
    const { state } = stubMail({ ...seeded() });
    state.connection = { ...OUTLOOK };
    await expect(apiFetch('/mail/drafts/55/', { method: 'DELETE' })).rejects.toMatchObject({ status: 400, body: { code: 'GMAIL_ONLY' } });
    state.connection = null;
    await expect(apiFetch('/mail/drafts/55/', { method: 'DELETE' })).rejects.toMatchObject({ status: 409, body: { code: 'NO_MAILBOX' } });
    state.drafts[0].gmail = { state: 'local' };
    await apiFetch('/mail/drafts/55/', { method: 'DELETE' });
    expect(state.drafts).toEqual([]);
    expect(state.messages.some((m) => m.id === MAIL_DRAFT_MESSAGE.id)).toBe(false);
    await expect(apiFetch('/mail/drafts/55/', { method: 'DELETE' })).rejects.toMatchObject({ status: 404 });
  });

  it('discards in bulk, all or nothing, and answers 409 for a sent draft', async () => {
    const { state } = stubMail({ ...seeded() });
    await expect(apiFetch('/mail/drafts/discard/', { method: 'POST', body: { ids: [55, 999] } })).rejects.toMatchObject({ status: 404 });
    expect(state.drafts).toHaveLength(1);
    expect(await apiFetch('/mail/drafts/discard/', { method: 'POST', body: { ids: [55] } })).toEqual({ discarded: 1 });
    expect(state.drafts).toEqual([]);
    const sent = stubMail({ ...seeded({ status: 'sent' }) });
    await expect(apiFetch('/mail/drafts/55/', { method: 'DELETE' })).rejects.toMatchObject({ status: 409, body: { code: 'ALREADY_SENT' } });
    expect(sent.state.drafts).toHaveLength(1);
  });

  it('filters the mailbox lists by q on subject, sender and snippet', async () => {
    stubMail({ messages: D2_MESSAGES });
    const messages = await apiFetch<MailPage>('/mail/messages/?q=circleback');
    expect(messages.results.map((m) => m.id)).toEqual([4]);
    const threads = await apiFetch<{ results: { thread_id: string }[] }>('/mail/threads/?folder=all&q=invoice');
    expect(threads.results.map((t) => t.thread_id)).toEqual(['t2']);
  });

  it('searches Gmail 20 a page with held marks, and opening stores the message', async () => {
    const { state } = stubMail({ messages: [MAIL_DETAIL], gmailOnly: [GMAIL_OLD] });
    const page = await apiFetch<GmailSearchPage>('/mail/gmail/search/?q=renewal');
    expect(page.results.map((r) => [r.subject, r.message_id])).toEqual([
      ['Renewal quote', 1],
      ['2024 renewal', null],
    ]);
    const opened = await apiFetch<{ id: number }>('/mail/gmail/search/open/', { method: 'POST', body: { gmail_id: page.results[1].gmail_id } });
    expect(state.messages.some((m) => m.id === opened.id)).toBe(true);
  });

  it('refuses a Gmail search the contract refuses', async () => {
    const { state } = stubMail({ messages: [MAIL_DETAIL] });
    await expect(apiFetch('/mail/gmail/search/?q=%20')).rejects.toMatchObject({ status: 400, body: { q: ['Type something to search for.'] } });
    state.connection = null;
    await expect(apiFetch('/mail/gmail/search/?q=a')).rejects.toMatchObject({ status: 409, body: { code: 'NO_MAILBOX' } });
    state.connection = { ...OUTLOOK };
    await expect(apiFetch('/mail/gmail/search/?q=a')).rejects.toMatchObject({ status: 400, body: { code: 'GMAIL_ONLY' } });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, sent } from '../agents/testAgents';
import { attachmentBytes, DraftSession } from './draftSession';
import { MAIL_SEND_MAX_BYTES, type DraftAttachment } from './mailDrafts';
import { bodyBytes, D2_MESSAGES, GOOGLE, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, QUOTE_ANN, SIGNATURE, stubMail } from './testMail';

// Unit tier: one draft's life (Decisions 4 to 6, 10), with no React. The
// stub answers in the contract's shapes; timers are faked so the 2 s
// autosave runs on demand.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ready(target: ConstructorParameters<typeof DraftSession>[0]) {
  const session = new DraftSession(target);
  await session.start();
  return session;
}

describe('DraftSession', () => {
  it('starts a reply from the prefill: Ann in To, the quote folded, and nothing stored while untouched', async () => {
    vi.useFakeTimers();
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'reply', messageId: 1 });
    const state = session.getState();
    expect(state.phase).toBe('ready');
    expect(state.fields.to).toEqual([['Ann Lee', 'ann@pizzahut.com']]);
    expect(state.fields.subject).toBe('Re: Renewal quote');
    expect(state.fields.body).toBe(`<p></p>${SIGNATURE}`);
    expect(state.quote).toMatch(/^<div class="gmail_quote">/);
    expect(state.record?.name).toBe('Pizza Hut');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
    expect(await session.close()).toBe(true);
  });

  it('creates the draft 2 s after the first change, then PATCHes the whole content with the revision', async () => {
    vi.useFakeTimers();
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'reply', messageId: 1 });
    session.edit({ body: `<p>Works for us.</p>${SIGNATURE}` });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    const [created] = sent(spy, 'POST', '/mail/drafts/') as Record<string, unknown>[];
    expect(created).toMatchObject({ kind: 'reply', source_message_id: 1, to: [['Ann Lee', 'ann@pizzahut.com']], subject: 'Re: Renewal quote' });
    // Cleaned on the way out (Decision 1): the marker serialises with ="".
    expect(created.html).toBe(`<p>Works for us.</p><div data-revenact-signature="">Dana Ruiz<br>Dough Co</div>${session.getState().quote}`);
    expect(created).not.toHaveProperty('record');
    expect(session.getState().draft?.revision).toBe(1);

    session.edit({ subject: 'Re: Renewal quote, signed' });
    session.edit({ subject: 'Re: Renewal quote (signed)' });
    await vi.advanceTimersByTimeAsync(2_000);
    const patches = sent(spy, 'PATCH', '/mail/drafts/') as Record<string, unknown>[];
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ subject: 'Re: Renewal quote (signed)', revision: 1 });
    expect(session.getState().draft?.revision).toBe(2);
    expect(session.getState().dirty).toBe(false);
  });

  it('sends a chosen record, and stops following the suggestion', async () => {
    vi.useFakeTimers();
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'new' });
    session.setRecord({ kind: 'customer', id: 2, name: 'Dough Co' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((sent(spy, 'POST', '/mail/drafts/')[0] as Record<string, unknown>).record).toEqual({ kind: 'customer', id: 2 });
    expect(session.getState().recordChosen).toBe(true);
    session.setRecord(null);
    await session.flush();
    expect((sent(spy, 'PATCH', '/mail/drafts/')[0] as Record<string, unknown>).record).toBeNull();
    expect(session.getState().record).toBeNull();
  });

  it('on DRAFT_CHANGED stops saving and lets the person take the Gmail version or keep theirs', async () => {
    vi.useFakeTimers();
    const { spy, state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    expect(session.getState().fields.body).toBe(`<p>Works for us.</p>${SIGNATURE}`);
    expect(session.getState().quote).toBe(QUOTE_ANN);
    // Edited in Gmail meanwhile.
    Object.assign(state.drafts[0], { revision: 3, subject: 'Re: Renewal quote (from Gmail)', html: `<p>Thursday works.</p>${SIGNATURE}`, text: 'Thursday works.' });
    session.edit({ subject: 'Mine' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(session.getState().conflict?.revision).toBe(3);
    session.edit({ subject: 'Mine, again' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sent(spy, 'PATCH', '/mail/drafts/55/')).toHaveLength(1);

    const seed = session.getState().seed;
    session.takeGmail();
    expect(session.getState().conflict).toBeNull();
    expect(session.getState().fields.subject).toBe('Re: Renewal quote (from Gmail)');
    expect(session.getState().fields.body).toBe(`<p>Thursday works.</p>${SIGNATURE}`);
    expect(session.getState().seed).toBe(seed + 1);

    state.drafts[0].revision = 4;
    session.edit({ subject: 'Mine at last' });
    await vi.advanceTimersByTimeAsync(2_000);
    session.keepMine();
    await vi.advanceTimersByTimeAsync(0);
    const last = sent(spy, 'PATCH', '/mail/drafts/55/').at(-1) as Record<string, unknown>;
    expect(last).toMatchObject({ subject: 'Mine at last', revision: 4 });
    expect(session.getState().conflict).toBeNull();
  });

  it('will not close while a Gmail change waits for a choice, so the edits are not lost', async () => {
    vi.useFakeTimers();
    const { state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    Object.assign(state.drafts[0], { revision: 3, subject: 'Re: Renewal quote (from Gmail)' });
    session.edit({ subject: 'Mine' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(session.getState().conflict).not.toBeNull();
    expect(await session.close()).toBe(false);
    expect(session.getState().fields.subject).toBe('Mine');
    session.keepMine();
    await vi.advanceTimersByTimeAsync(0);
    expect(await session.close()).toBe(true);
  });

  it('saves an unsaved edit before sending, sends the next revision with the screen content, and becomes sent', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    session.edit({ subject: 'Re: Renewal quote, final' });
    expect(await session.send()).toBe(true);
    expect(session.getState().phase).toBe('sent');
    expect(session.getState().sent?.message.folder).toBe('sent');
    expect(sent(spy, 'PATCH', '/mail/drafts/55/')).toEqual([expect.objectContaining({ subject: 'Re: Renewal quote, final', revision: 1 })]);
    const body = sent(spy, 'POST', '/mail/drafts/55/send/')[0] as Record<string, unknown>;
    expect(body).toMatchObject({ revision: 2, subject: 'Re: Renewal quote, final' });
  });

  it('refuses to send to nobody before saving anything', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'new' });
    expect(await session.send()).toBe(false);
    expect(session.getState().failure?.fields.to).toBe('Add someone to send it to.');
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('reads the draft again after an unconfirmed send: still sending, not yet resolvable', async () => {
    const { spy } = stubMail({
      messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE],
      drafts: [MAIL_DRAFT],
      sendAnswer: { status: 504, body: { code: 'SEND_UNCONFIRMED', detail: "We couldn't confirm this was sent. Check your Sent folder." } },
    });
    const session = await ready({ kind: 'draft', draftId: 55 });
    expect(await session.send()).toBe(false);
    expect(session.getState().failure?.text).toBe("We couldn't confirm this was sent. Check your Sent folder.");
    expect(calls(spy, 'GET', '/mail/drafts/55/')).toHaveLength(2);
    expect(session.getState().draft).toMatchObject({ status: 'sent', sending: 'pending', can_resolve: false, sent_at: null });
    expect(session.getState().phase).toBe('ready');
  });

  it('settles an unconfirmed send: Reopen draft opens it again, It was sent marks it sent', async () => {
    const unconfirmed = { ...MAIL_DRAFT, status: 'sent' as const, sending: 'unconfirmed' as const, can_resolve: true };
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [unconfirmed, { ...unconfirmed, id: 56, message_id: 71 }] });
    const reopened = await ready({ kind: 'draft', draftId: 55 });
    await reopened.resolve('reopen');
    expect(reopened.getState().draft?.status).toBe('open');
    expect(reopened.getState().failure).toBeNull();
    expect(calls(spy, 'POST', '/reopen/')).toEqual(['/mail/drafts/55/reopen/']);

    const confirmed = await ready({ kind: 'draft', draftId: 56 });
    await confirmed.resolve('confirm');
    expect(confirmed.getState().draft).toMatchObject({ status: 'sent', sending: null });
    expect(calls(spy, 'POST', '/confirm-sent/')).toEqual(['/mail/drafts/56/confirm-sent/']);

    // A second answer is refused: the fallback is DRAFTS', the server's words win.
    await confirmed.resolve('confirm');
    expect(confirmed.getState().failure?.text).toBe("This draft isn't waiting for confirmation.");
  });

  it('says the paused words on send, and keeps the draft', async () => {
    stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT], connection: { ...GOOGLE, paused_reason: 'workspace_off' } });
    const session = await ready({ kind: 'draft', draftId: 55 });
    expect(await session.send()).toBe(false);
    expect(session.getState().failure?.text).toBe("Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.");
    expect(session.getState().phase).toBe('ready');
  });

  it('cannot start on a read-only mailbox, and says why in the server words', async () => {
    stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, two_way: false } });
    const session = new DraftSession({ kind: 'new' });
    await session.start();
    expect(session.getState().phase).toBe('failed');
    expect(session.getState().loadError).toBe("Reconnect Google to turn on two-way: changes here can't reach Gmail yet.");
  });

  it('discards: nothing to call before a draft exists, DELETE after', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const fresh = await ready({ kind: 'new' });
    expect(await fresh.discard()).toBe(true);
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([]);
    const saved = await ready({ kind: 'draft', draftId: 55 });
    expect(await saved.discard()).toBe(true);
    expect(saved.getState().phase).toBe('discarded');
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual(['/mail/drafts/55/']);
  });

  it('counts a draft already gone (404) as discarded', async () => {
    const { state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    state.drafts = [];
    expect(await session.discard()).toBe(true);
    expect(session.getState().phase).toBe('discarded');
    expect(session.getState().failure).toBeNull();
  });

  it('close saves first, and says when an unsaved message would be lost', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'new' });
    session.edit({ subject: 'Hello' });
    // Two-way goes off after the prefill, so the first save is refused.
    state.connection = { ...GOOGLE, two_way: false };
    expect(await session.close()).toBe(false);
    expect(session.getState().failure?.code).toBe('TWO_WAY_OFF');
  });

  describe('while Gmail is still saving (gmail.state "saving")', () => {
    it('reads the draft again every 3 s until Gmail has it, taking only gmail and sync_issue', async () => {
      vi.useFakeTimers();
      const { spy } = stubMail({ messages: D2_MESSAGES });
      const session = await ready({ kind: 'reply', messageId: 1 });
      session.edit({ subject: 'Mine' });
      await vi.advanceTimersByTimeAsync(2_000);
      const id = session.getState().draft?.id as number;
      expect(session.getState().draft?.gmail.state).toBe('saving');
      await vi.advanceTimersByTimeAsync(2_999);
      expect(calls(spy, 'GET', `/mail/drafts/${id}/`)).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls(spy, 'GET', `/mail/drafts/${id}/`)).toHaveLength(1);
      expect(session.getState().draft).toMatchObject({ gmail: { state: 'saved' }, sync_issue: null, revision: 1 });
      expect(session.getState().fields.subject).toBe('Mine');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls(spy, 'GET', `/mail/drafts/${id}/`)).toHaveLength(1);
    });

    it('shows the sync issue when Gmail refuses the save', async () => {
      vi.useFakeTimers();
      stubMail({ messages: D2_MESSAGES, draftSaveFails: true });
      const session = await ready({ kind: 'new' });
      session.edit({ subject: 'Hello' });
      await vi.advanceTimersByTimeAsync(2_000 + 3_000);
      expect(session.getState().draft).toMatchObject({ gmail: { state: 'failed' }, sync_issue: { text: "Couldn't save this draft to Gmail." } });
    });

    it('gives up after 5 reads that still say saving', async () => {
      vi.useFakeTimers();
      const { spy } = stubMail({ messages: D2_MESSAGES });
      // A Gmail that never answers: every read still says saving.
      vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
        const answer = (await spy(input, init)) as { ok: boolean; status: number; json: () => Promise<unknown> };
        if ((init?.method ?? 'GET') !== 'GET' || !/\/mail\/drafts\/\d+\/$/.test(new URL(input).pathname)) return answer;
        const body = (await answer.json()) as Record<string, unknown>;
        return { ...answer, json: async () => ({ ...body, gmail: { state: 'saving' } }) };
      });
      const session = await ready({ kind: 'new' });
      session.edit({ subject: 'Hello' });
      await vi.advanceTimersByTimeAsync(2_000 + 60_000);
      expect(calls(spy, 'GET', `/mail/drafts/${session.getState().draft?.id}/`)).toHaveLength(5);
      expect(session.getState().draft?.gmail.state).toBe('saving');
    });

    it('stops reading on a new edit, and on dispose', async () => {
      vi.useFakeTimers();
      const { spy } = stubMail({ messages: D2_MESSAGES });
      const session = await ready({ kind: 'new' });
      session.edit({ subject: 'Hello' });
      await vi.advanceTimersByTimeAsync(2_000 + 1_000);
      const id = session.getState().draft?.id as number;
      session.edit({ subject: 'Hello again' });
      await vi.advanceTimersByTimeAsync(1_999);
      expect(calls(spy, 'GET', `/mail/drafts/${id}/`)).toEqual([]);
      // The PATCH answers saving again; dispose before the next read.
      await vi.advanceTimersByTimeAsync(1);
      expect(sent(spy, 'PATCH', `/mail/drafts/${id}/`)).toHaveLength(1);
      session.dispose();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls(spy, 'GET', `/mail/drafts/${id}/`)).toEqual([]);
    });
  });

  describe('attachment bytes (one place for the total and the limit)', () => {
    const file = (id: number, size: number) => ({ id, size }) as DraftAttachment;

    it('a forward counts the prefill numbers until a draft exists, then the draft numbers', async () => {
      vi.useFakeTimers();
      stubMail({ messages: D2_MESSAGES });
      const session = await ready({ kind: 'forward', messageId: 1 });
      // The prefill's total carries the bodies too (contract decision 20).
      const { total, max } = attachmentBytes(session.getState());
      expect(total).toBeGreaterThan(182311 + 24576);
      expect(max).toBe(MAIL_SEND_MAX_BYTES);
      session.edit({ to: [['', 'sam@pizzahut.com']] });
      await vi.advanceTimersByTimeAsync(2_000);
      const draft = session.getState().draft;
      expect(draft).not.toBeNull();
      expect(attachmentBytes(session.getState())).toEqual({ total: draft?.total_bytes, max: draft?.max_bytes });
    });

    it('falls back to the forwarded files and MAIL_SEND_MAX_BYTES when the prefill says nothing', () => {
      expect(attachmentBytes({ draft: null, forwarded: [file(1, 10), file(2, 5)], prefillBytes: null })).toEqual({ total: 15, max: MAIL_SEND_MAX_BYTES });
      expect(attachmentBytes({ draft: null, forwarded: [file(1, 10)], prefillBytes: { total_bytes: 40, max_bytes: 100 } })).toEqual({ total: 40, max: 100 });
    });
  });
});

describe('DraftSession attachments (Decision 9)', () => {
  const pdf = (name = 'Quote v2.pdf', size?: number) => {
    const file = new File(['quote'], name, { type: 'application/pdf' });
    if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
    return file;
  };

  it('makes the draft for the first file, uploads it with progress, and adopts the new revision', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = new DraftSession({ kind: 'reply', messageId: 1 });
    await session.start();
    const seen: number[] = [];
    session.subscribe(() => {
      const upload = session.getState().uploads[0];
      if (upload) seen.push(upload.fraction);
    });
    await session.upload(pdf());
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual(['/mail/drafts/', `/mail/drafts/${session.getState().draft?.id}/attachments/`]);
    expect(seen).toContain(0.4);
    expect(session.getState().uploads).toEqual([]);
    const made = session.getState().draft;
    expect(made).toMatchObject({ revision: 2, total_bytes: 5 + bodyBytes(made?.html ?? '', made?.text ?? ''), attachments: [{ filename: 'Quote v2.pdf', origin: 'upload' }] });
    // The next PATCH carries the revision the upload moved to.
    session.edit({ subject: 'Quote attached' });
    await session.flush();
    expect(sent(spy, 'PATCH', '/mail/drafts/').at(-1)).toMatchObject({ revision: 2 });
  });

  it('refuses before uploading: a type not on the list, and a total over 25 MB with the contract sentence', async () => {
    const { spy } = stubMail({
      messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE],
      drafts: [{ ...MAIL_DRAFT, total_bytes: 25_000_000, attachments: [{ id: 90, filename: 'Big.pdf', mime_type: 'application/pdf', size: 25_000_000, origin: 'upload', download_url: '' }] }],
    });
    const session = new DraftSession({ kind: 'draft', draftId: 55 });
    await session.start();
    await session.upload(pdf('pricing.zip'));
    expect(session.getState().failure?.text).toBe('.zip is not an accepted file type.');
    await session.upload(pdf('big.pdf', 2_000_000));
    expect(session.getState().failure?.text).toBe('Attachments are limited to 25 MB in total.');
    expect(calls(spy, 'POST', '/attachments/')).toEqual([]);
  });

  it('removes a forwarded original before the draft exists, and sends only the kept ones', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = new DraftSession({ kind: 'forward', messageId: 1 });
    await session.start();
    expect(session.getState().forwarded.map((f) => f.filename)).toEqual(['Renewal quote.pdf', 'Pricing.zip']);
    await session.removeAttachment(33);
    await session.flush();
    expect((sent(spy, 'POST', '/mail/drafts/')[0] as Record<string, unknown>).forwarded).toEqual([31]);
    // Once the draft exists, a part is removed on the server.
    await session.removeAttachment(31);
    expect(calls(spy, 'DELETE', '/attachments/')).toEqual([`/mail/drafts/${session.getState().draft?.id}/attachments/31/`]);
    expect(session.getState().draft?.attachments).toEqual([]);
  });

  it('keeps the total right when a forwarded original is removed before the draft exists', async () => {
    stubMail({ messages: D2_MESSAGES });
    const session = new DraftSession({ kind: 'forward', messageId: 1 });
    await session.start();
    // What is not a file is the bodies (contract decision 20).
    const bodies = attachmentBytes(session.getState()).total - (182311 + 24576);
    expect(bodies).toBeGreaterThan(0);
    await session.removeAttachment(33);
    expect(attachmentBytes(session.getState()).total).toBe(182311 + bodies);
    await session.removeAttachment(31);
    expect(attachmentBytes(session.getState()).total).toBe(bodies);
  });

  it('marks the draft as saving after an upload or a delete, so the re-read settles it', async () => {
    stubMail({ messages: D2_MESSAGES });
    const session = new DraftSession({ kind: 'reply', messageId: 1 }, 2000, 5);
    await session.start();
    await session.upload(pdf());
    expect(session.getState().draft?.gmail.state).toBe('saving');
    await vi.waitFor(() => expect(session.getState().draft?.gmail.state).toBe('saved'));
    await session.removeAttachment(session.getState().draft!.attachments[0].id);
    expect(session.getState().draft?.gmail.state).toBe('saving');
    await vi.waitFor(() => expect(session.getState().draft?.gmail.state).toBe('saved'));
    session.dispose();
  });
});

describe('DraftSession while sent, sending or loading', () => {
  const locked = (sending: 'pending' | 'unconfirmed') => ({ ...MAIL_DRAFT, status: 'sent' as const, sending, can_resolve: sending === 'unconfirmed' });

  it.each(['pending', 'unconfirmed'] as const)('refuses edit, setRecord, upload, removeAttachment and discard once the send is %s', async (sending) => {
    vi.useFakeTimers();
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [locked(sending)] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    const before = session.getState().fields;
    session.edit({ subject: 'Changed' });
    session.setRecord(null);
    await session.upload(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await session.removeAttachment(1);
    expect(await session.discard()).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(session.getState()).toMatchObject({ phase: 'ready', dirty: false, uploads: [], failure: null });
    expect(session.getState().fields).toBe(before);
    expect(calls(spy, 'PATCH', '/mail/drafts/')).toEqual([]);
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([]);
    expect(calls(spy, 'POST', '/attachments/')).toEqual([]);
  });

  it('ignores discard while loading, so start() cannot flip it back to ready', async () => {
    stubMail({ messages: D2_MESSAGES });
    const session = new DraftSession({ kind: 'reply', messageId: 1 });
    const starting = session.start();
    expect(await session.discard()).toBe(false);
    await starting;
    expect(session.getState().phase).toBe('ready');
  });

  it('drops a late reread when reopen already adopted a newer draft', async () => {
    const unconfirmed = { ...MAIL_DRAFT, status: 'sent' as const, sending: 'unconfirmed' as const, can_resolve: true };
    stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [unconfirmed] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    // Hold the reread's answer until the reopen has been adopted.
    const real = globalThis.fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!held && (init?.method ?? 'GET') === 'GET' && String(input).includes('/mail/drafts/55/')) {
        held = true;
        await gate;
        // The old answer, as it was when the read began.
        return new Response(JSON.stringify(unconfirmed), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return real(input, init);
    });
    const late = session.reread();
    await session.resolve('reopen');
    release();
    expect(held).toBe(true);
    expect(session.getState().draft?.status).toBe('open');
    await late;
    expect(session.getState().draft).toMatchObject({ status: 'open', sending: null });
  });
});

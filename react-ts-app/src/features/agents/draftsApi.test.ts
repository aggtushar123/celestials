import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { discardDraft, draftFieldErrors, draftsQuery, fetchDraft, listDrafts, markDraftSent, saveDraft, sendDraft } from './draftsApi';
import { refusalCode, refusalDetail } from './agentsApi';
import { calls, sent } from './testAgents';
import { DRAFT_CARLS, DRAFT_EMAIL, DRAFT_TICKET, stubDrafts } from './testDrafts';

afterEach(() => vi.unstubAllGlobals());

const refusal = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (err) {
    return err;
  }
  throw new Error('expected a refusal');
};

describe('reply drafts API (delivery 2 contract)', () => {
  it('lists the reader own open drafts, by channel', async () => {
    const { spy } = stubDrafts();
    expect(draftsQuery({ channel: 'email' })).toBe('?channel=email');
    expect(draftsQuery({})).toBe('');
    expect((await listDrafts({ channel: 'email' })).results.map((d) => d.id)).toEqual([DRAFT_EMAIL.id]);
    expect((await listDrafts()).results.map((d) => d.id)).toEqual([DRAFT_TICKET.id, DRAFT_EMAIL.id]);
    expect(calls(spy, 'GET', '/communications/drafts/')).toEqual(['/communications/drafts/?channel=email', '/communications/drafts/']);
  });

  it('reads one, and refuses a stranger write as NOT_YOURS in the server words', async () => {
    stubDrafts();
    expect((await fetchDraft(DRAFT_CARLS.id)).can_edit).toBe(false);
    const err = await refusal(saveDraft(DRAFT_CARLS.id, { body: 'Hi' }));
    expect(refusalCode(err)).toBe('NOT_YOURS');
    expect(refusalDetail(err)).toBe('Only Carl CSM can change this draft.');
  });

  it('saves only what it is sent, marks it edited, and reads field errors', async () => {
    const { spy } = stubDrafts();
    const saved = await saveDraft(DRAFT_EMAIL.id, { body: 'Hi Ann, Friday works.' });
    expect(saved).toMatchObject({ body: 'Hi Ann, Friday works.', edited: true });
    expect(sent(spy, 'PATCH', '/communications/drafts/')).toEqual([{ body: 'Hi Ann, Friday works.' }]);
    const err = await refusal(saveDraft(DRAFT_TICKET.id, { body: ' ', subject: 'Hello' }));
    expect(err).toBeInstanceOf(ApiError);
    expect(draftFieldErrors(err)).toEqual({ body: 'Write the reply.', subject: 'A ticket reply has no subject.' });
  });

  it('sends an email draft, and refuses NO_MAILBOX and WRONG_CHANNEL in order', async () => {
    stubDrafts({ mailbox: false });
    expect(refusalDetail(await refusal(sendDraft(DRAFT_TICKET.id)))).toBe('Copy a ticket reply into its source and mark it sent.');
    expect(refusalDetail(await refusal(sendDraft(DRAFT_EMAIL.id)))).toBe('Connect your mailbox to send this.');
    vi.unstubAllGlobals();
    stubDrafts();
    const answer = await sendDraft(DRAFT_EMAIL.id, { subject: 'Re: Renewal terms, revised' });
    expect(answer.draft).toMatchObject({ status: 'sent', subject: 'Re: Renewal terms, revised', can_edit: false, sent_by: { id: 1, name: 'Alice' } });
    expect(refusalCode(await refusal(sendDraft(DRAFT_EMAIL.id)))).toBe('ALREADY_SENT');
  });

  it('marks a ticket draft sent, and discards a draft once', async () => {
    stubDrafts();
    expect(refusalDetail(await refusal(markDraftSent(DRAFT_EMAIL.id)))).toBe('Send an email draft instead.');
    expect((await markDraftSent(DRAFT_TICKET.id)).status).toBe('sent');
    expect(await discardDraft(DRAFT_EMAIL.id)).toBeNull();
    expect((await refusal(fetchDraft(DRAFT_EMAIL.id)) as ApiError).status).toBe(404);
  });
});

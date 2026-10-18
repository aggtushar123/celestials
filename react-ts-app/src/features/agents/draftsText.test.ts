import { describe, expect, it } from 'vitest';
import {
  copyLabel,
  draftByText,
  draftHeading,
  draftParam,
  notOwnerText,
  recipientsText,
  sentNotice,
  sentText,
  sourceText,
  withDraft,
  withoutDraft,
} from './draftsText';
import type { TicketDraftSource } from './draftTypes';
import { DRAFT_CARLS, DRAFT_EMAIL, DRAFT_TICKET } from './testDrafts';

const TICKET = DRAFT_TICKET.source as TicketDraftSource;
const SENT = { status: 'sent' as const, sent_at: '2026-10-08T10:00:00Z', sent_by: { id: 1, name: 'Alice' } };

describe('the ?draft= link (Decision 1)', () => {
  it('reads only a positive whole id', () => {
    expect(draftParam(new URLSearchParams('draft=7'))).toBe(7);
    expect(draftParam(new URLSearchParams('draft=0'))).toBeNull();
    expect(draftParam(new URLSearchParams('draft=abc'))).toBeNull();
    expect(draftParam(new URLSearchParams(''))).toBeNull();
  });

  it('adds the draft to the page query, and Back drops only the draft', () => {
    expect(withDraft('?source=mailbox:google', 7)).toBe('?source=mailbox%3Agoogle&draft=7');
    expect(withoutDraft('?source=mailbox%3Agoogle&draft=7')).toBe('/communications?source=mailbox%3Agoogle');
    expect(withoutDraft('?draft=7')).toBe('/communications');
  });
});

describe('a draft in words', () => {
  it('names recipients, the agent and the heading', () => {
    expect(recipientsText([['Ann Lee', 'ann@x.com'], ['', 'ops@x.com']])).toBe('Ann Lee <ann@x.com>, ops@x.com');
    expect(draftByText('cs')).toBe('The CS agent drafted a reply.');
    expect(draftHeading(DRAFT_EMAIL)).toBe('Reply to Ann Lee');
    expect(draftHeading(DRAFT_TICKET)).toBe('Reply on TKT-1042');
  });

  it('says what the draft answers', () => {
    expect(sourceText(DRAFT_EMAIL)).toBe('Ann Lee <ann@x.com> wrote "Renewal terms" on 6 Oct 2026.');
    expect(sourceText(DRAFT_TICKET)).toBe('TKT-1042 "Export fails" in Zendesk.');
    expect(sourceText({ ...DRAFT_TICKET, source: { ...TICKET, external_url: null, source_name: null } })).toBe('TKT-1042 "Export fails".');
  });

  it('says who may change it and when it went', () => {
    expect(notOwnerText(DRAFT_CARLS)).toBe('Only Carl CSM can change or send this draft.');
    expect(sentText({ ...DRAFT_EMAIL, ...SENT })).toBe('Sent on 8 Oct 2026 by Alice.');
    expect(sentText({ ...DRAFT_TICKET, ...SENT })).toBe('Marked as sent on 8 Oct 2026 by Alice.');
    expect(sentNotice(DRAFT_EMAIL)).toBe('Sent to Ann Lee <ann@x.com>.');
    expect(sentNotice(DRAFT_TICKET)).toBe('Marked as sent.');
  });

  it('names the copy button after the source only when it can open it (Decision 5)', () => {
    expect(copyLabel(TICKET)).toBe('Copy and open in Zendesk');
    expect(copyLabel({ ...TICKET, external_url: null, source_name: null })).toBe('Copy the reply');
  });
});

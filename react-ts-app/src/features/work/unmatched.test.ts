import { afterEach, describe, expect, it, vi } from 'vitest';
import { whenText } from '../agents/whenText';
import { ITEM_JIRA, ITEM_SLACK } from './testUnmatched';
import { ApiError } from '../../lib/apiClient';
import { UNMATCHED, addContactText, deletesText, dismissUnmatched, fetchUnmatched, isGone, isLong, matchUnmatched, matchedText, metaLine, openText } from './unmatched';

afterEach(() => vi.unstubAllGlobals());

function spy(body: unknown, status = 200) {
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

const urlOf = (s: ReturnType<typeof spy>, n = 0) => String((s.mock.calls[n] as unknown[])[0]);
const initOf = (s: ReturnType<typeof spy>, n = 0) => (s.mock.calls[n] as unknown[])[1] as RequestInit;

describe('unmatched api (round 2 D3 contract §3)', () => {
  it('reads a queue, and its next page by cursor', async () => {
    const s = spy({ queue: 'department:cs', count: 0, items: [], next: null });
    await fetchUnmatched('department:cs');
    await fetchUnmatched('department:cs', 'abc=');
    expect(urlOf(s)).toContain('/work/unmatched/?queue=department%3Acs');
    expect(urlOf(s, 1)).toContain('cursor=abc%3D');
  });

  it('matches with one record and the contact choice', async () => {
    const s = spy({ ticket: { id: 1, number: 'SUP-31', record: { type: 'customer', id: 4, name: 'Newco' } }, contact_added: true });
    await matchUnmatched(41, { customer_id: 4, add_contact: true });
    expect(urlOf(s)).toContain('/work/unmatched/41/match/');
    expect(initOf(s).method).toBe('POST');
    expect(JSON.parse(String(initOf(s).body))).toEqual({ customer_id: 4, add_contact: true });
  });

  it('dismisses', async () => {
    const s = spy({ dismissed: true });
    await dismissUnmatched(41);
    expect(urlOf(s)).toContain('/work/unmatched/41/dismiss/');
  });
});

describe('unmatched words (frontend Decisions 1 to 4)', () => {
  it('says where it came from and who sent it', () => {
    const now = new Date('2026-10-14T11:12:00Z');
    expect(metaLine(ITEM_JIRA, now)).toBe(`Jira SUP · SUP-31 · from Ann Lee (ann@newco.io) · ${whenText(ITEM_JIRA.last_seen_at, now)}`);
    expect(metaLine(ITEM_SLACK, now)).toMatch(/^Slack #support · #support · from Ben Ode · /);
    expect(metaLine({ ...ITEM_SLACK, from: { name: '', email: '' } }, now)).toMatch(/^Slack #support · #support · from someone · /);
    expect(metaLine({ ...ITEM_JIRA, from: { name: '', email: 'ann@newco.io' } }, now)).toContain('from ann@newco.io · ');
  });

  it("never shows a Slack sender's email", () => {
    const now = new Date('2026-10-14T11:12:00Z');
    const withEmail = { ...ITEM_SLACK, from: { name: 'Ben Ode', email: 'ben@ourco.io' } };
    expect(metaLine(withEmail, now)).not.toContain('ben@ourco.io');
    expect(metaLine(withEmail, now)).toMatch(/from Ben Ode · /);
    expect(metaLine({ ...withEmail, from: { name: '', email: 'ben@ourco.io' } }, now)).toMatch(/from someone · /);
  });

  it('dates, offers and outcomes', () => {
    expect(deletesText('2026-11-13')).toBe('Deleted on 13 Nov if no one matches it.');
    expect(deletesText('2026-09-05')).toBe('Deleted on 5 Sep if no one matches it.');
    expect(addContactText('ann@newco.io')).toBe('Also add ann@newco.io as a contact of the record, so their next messages match by themselves.');
    expect(matchedText('Pizza Hut')).toBe('Matched to Pizza Hut. An agent reads it at the next run.');
    expect(openText('jira')).toBe('Open in Jira');
    expect(openText('slack')).toBe('Open in Slack');
    expect(isLong('x'.repeat(281))).toBe(true);
    expect(isLong('x'.repeat(280))).toBe(false);
    expect(UNMATCHED.TITLE).toBe('Needs a customer');
  });

  it('reads the matched record from the answer for Slack and Jira alike', () => {
    expect(matchedText({ type: 'customer', id: 29, name: 'Globex (QA)' }.name)).toBe('Matched to Globex (QA). An agent reads it at the next run.');
  });
});

describe('isGone (contract §3.2, §3.3)', () => {
  it('is a 409 GONE or any 404, nothing else', () => {
    expect(isGone(new ApiError(409, { code: 'GONE', detail: 'x' }, 'x'))).toBe(true);
    expect(isGone(new ApiError(404, { detail: 'Not found.' }, 'x'))).toBe(true);
    expect(isGone(new ApiError(409, { code: 'NOT_COVERED' }, 'x'))).toBe(false);
    expect(isGone(new ApiError(400, {}, 'x'))).toBe(false);
    expect(isGone(new Error('x'))).toBe(false);
    expect(UNMATCHED.GONE).toBe('Someone else dealt with this message. Reload the list.');
  });
});

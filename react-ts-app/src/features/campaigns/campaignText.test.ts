import { describe, expect, it } from 'vitest';
import type { SentencePart } from '../segments/ruleSentence';
import {
  audienceParts,
  countsParts,
  footerLines,
  hiddenPeople,
  lastSendParts,
  NO_SKIPS,
  reasonText,
  recordPath,
  rolesText,
  segmentKindOf,
  sendByText,
  sendDay,
  shortLabel,
  skipLines,
  skippedTotal,
} from './campaignText';
import type { CampaignSend, Counts } from './campaignTypes';

const text = (parts: SentencePart[]) => parts.map((part) => part.text).join('');
const figures = (parts: SentencePart[]) => parts.filter((part) => part.numeric).map((part) => part.text);
const counts = (sent: number, skipped: Partial<Counts['skipped']>): Counts => {
  const all = { ...NO_SKIPS, ...skipped };
  return { reached: sent + skippedTotal(all), sent, skipped: all };
};
const SEND: CampaignSend = {
  id: 41,
  kind: 'manual',
  status: 'sent',
  migrated: false,
  sent_by: { id: 1, name: 'Alice' },
  rule: null,
  started_at: '2026-10-02T12:00:00Z',
  finished_at: '2026-10-02T12:01:00Z',
  subject: 'Hi',
  body: 'Hello',
  counts: counts(2, { unsubscribed: 1, failed: 1 }),
};

describe('campaign text (spec §2)', () => {
  it("reads §4's organisation kind and the segments contract's customer as the same kind", () => {
    expect(segmentKindOf('organization')).toBe('customer');
    expect(segmentKindOf('customer')).toBe('customer');
    expect(segmentKindOf('account')).toBe('account');
    expect(segmentKindOf('contact')).toBe('contact');
  });

  it('says whom a send emails and why the rest are skipped, the figures apart (spec §2.2)', () => {
    const parts = audienceParts({ reach: 212, skipped: { ...NO_SKIPS, unsubscribed: 14, recent_campaign: 9, already_received: 3 }, sample: [] });
    expect(text(parts)).toBe('Emails 212 people · Skips 14 unsubscribed · 9 emailed in the last 3 days · 3 already received it');
    expect(figures(parts)).toEqual(['212', '14', '9', '3']);
    expect(text(audienceParts({ reach: 1, skipped: NO_SKIPS, sample: [] }))).toBe('Emails 1 person');
    expect(text(audienceParts({ reach: 0, skipped: { ...NO_SKIPS, no_email: 2, over_limit: 1, failed: 0 }, sample: [] }))).toBe(
      'Emails 0 people · Skips 2 without an email · 1 over the limit of 500',
    );
  });

  it('lists the skips in the order the backend checks them, leaving out the zeros', () => {
    expect(skipLines({ ...NO_SKIPS, failed: 1, unsubscribed: 2 })).toEqual([
      { n: 2, text: 'unsubscribed' },
      { n: 1, text: "couldn't be delivered" },
    ]);
  });

  it("reads a row's last send: a migrated draft, never sent, sending, or its day and counts (spec §2.1)", () => {
    expect(text(lastSendParts({ needs_segment: true, last_send: null }))).toBe('Choose a segment to send');
    expect(text(lastSendParts({ needs_segment: false, last_send: null }))).toBe('Never sent');
    expect(text(lastSendParts({ needs_segment: false, last_send: { id: 45, finished_at: null, status: 'sending', counts: counts(0, {}) } }))).toBe('Sending…');
    const sent = lastSendParts({ needs_segment: false, last_send: { id: 41, finished_at: '2026-10-02T12:01:00Z', status: 'sent', counts: SEND.counts } });
    expect(text(sent)).toBe('2 Oct · 2 sent · 2 skipped');
    expect(figures(sent)).toEqual(['2', '2']);
    expect(text(countsParts(counts(6, {})))).toBe('6 sent · 0 skipped');
  });

  it('says who sent it: a person, a readable rule, an unreadable rule, or a migrated send (spec §2.3)', () => {
    expect(sendByText(SEND)).toBe('Sent by Alice');
    expect(sendByText({ ...SEND, sent_by: null, migrated: true })).toBe('Sent');
    expect(sendByText({ ...SEND, kind: 'rule', sent_by: null, rule: { id: 8, name: 'EMEA renewals' } })).toBe('From rule EMEA renewals');
    expect(sendByText({ ...SEND, kind: 'rule', sent_by: null, rule: { id: null, name: 'a rule' } })).toBe('From a rule');
    expect(sendDay(SEND)).toBe('2 Oct 2026');
    expect(sendDay({ ...SEND, finished_at: null })).toBe('2 Oct 2026');
    expect(shortLabel('2026-10-02T12:01:00Z')).toBe('2 Oct');
  });

  it('words roles, reasons, the hidden people and the footer', () => {
    expect(rolesText(['champion', 'decision_maker'])).toBe('Champion, Decision Maker');
    expect(reasonText('no_email')).toBe('No email address');
    expect(reasonText('recent_campaign')).toBe('Emailed in the last 3 days');
    expect(reasonText('')).toBe('');
    expect(hiddenPeople(0)).toBeNull();
    expect(hiddenPeople(1)).toEqual({ n: 1, text: "more person you can't open" });
    expect(hiddenPeople(3)).toEqual({ n: 3, text: "more people you can't open" });
    expect(footerLines('Alice', 'Acme Inc')).toEqual(['Alice, Acme Inc', 'Unsubscribe from these emails: link']);
    expect(recordPath({ kind: 'organization', id: 7, name: 'Pizza Hut' })).toBe('/organizations/7');
    expect(recordPath({ kind: 'account', id: 14, name: 'Pizza EMEA' })).toBe('/accounts/14');
  });
});

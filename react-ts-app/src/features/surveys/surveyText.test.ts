import { describe, expect, it } from 'vitest';
import { countsLines, dayLabel, hiddenLine, reach, recordPath, segmentLabel, sendBlocker, sendLabel, skipLines } from './surveyText';
import type { AudienceCounts } from './surveyTypes';

const COUNTS: AudienceCounts = { audience: 42, organisations: 18, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0, hidden_count: 3, limit: 500 };

describe('who a survey reaches, in words (spec §2.2)', () => {
  it('says people at organisations, or accounts for an account segment, singular when one', () => {
    expect(reach(COUNTS, 'customer')).toEqual({ people: 42, peopleNoun: 'people', records: 18, recordNoun: 'organisations' });
    expect(reach(COUNTS, 'contact')).toMatchObject({ recordNoun: 'organisations' });
    expect(reach({ audience: 1, organisations: 1 }, 'account')).toEqual({ people: 1, peopleNoun: 'person', records: 1, recordNoun: 'account' });
  });

  it('counts each skip that happened, never one that did not', () => {
    expect(skipLines(COUNTS)).toEqual([
      { n: 6, text: 'skipped (surveyed in the last 30 days)' },
      { n: 2, text: 'without an email' },
    ]);
    expect(skipLines({ skipped_recent: 0, skipped_no_email: 0, skipped_cap: 4 })).toEqual([{ n: 4, text: 'over the limit of 3 per organisation or account' }]);
  });

  it("says how many in the segment the builder can't open, and nothing when none", () => {
    expect(hiddenLine(COUNTS)).toEqual({ n: 3, text: "in the segment you can't open aren't included" });
    expect(hiddenLine({ hidden_count: 1 })).toEqual({ n: 1, text: "in the segment you can't open isn't included" });
    expect(hiddenLine({ hidden_count: 0 })).toBeNull();
  });

  it("blocks a send to nobody or to more than the limit, in the backend's own words", () => {
    expect(sendBlocker({ audience: 0, limit: 500 })).toBe('Nobody to send to.');
    expect(sendBlocker({ audience: 612, limit: 500 })).toBe('This survey would reach 612 people; the most is 500.');
    expect(sendBlocker({ audience: 500, limit: 500 })).toBeNull();
  });

  it('labels the send button with the count', () => {
    expect(sendLabel(42)).toBe('Send to 42 people…');
    expect(sendLabel(1)).toBe('Send to 1 person…');
  });

  it("reads a send's frozen counts: people, sent, not delivered, then the skips", () => {
    expect(countsLines({ audience: 6, sent: 5, failed: 1, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0 })).toEqual([
      { n: 6, text: 'people' },
      { n: 5, text: 'sent' },
      { n: 1, text: 'not delivered' },
      { n: 6, text: 'skipped (surveyed in the last 30 days)' },
      { n: 2, text: 'without an email' },
    ]);
  });
});

describe('small labels', () => {
  it('names a deleted segment', () => {
    expect(segmentLabel(null)).toBe('Deleted segment');
    expect(segmentLabel({ id: null, name: 'EMEA accounts', kind: 'account' })).toBe('EMEA accounts');
  });

  it("dates a timestamp on the reader's own calendar day", () => {
    expect(dayLabel('2026-10-03T12:00:00Z')).toBe('3 Oct 2026');
  });

  it("links a record to its own page", () => {
    expect(recordPath({ kind: 'customer', id: 7, name: 'Pizza Hut' })).toBe('/organizations/7');
    expect(recordPath({ kind: 'account', id: 14, name: 'Pizza EMEA' })).toBe('/accounts/14');
  });
});

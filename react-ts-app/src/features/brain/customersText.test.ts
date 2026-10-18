import { describe, expect, it } from 'vitest';
import type { CustomerAnomaly, CustomerAsk } from './brainTypes';
import {
  anomalyMeta,
  askMeta,
  asksEmpty,
  askTrend,
  commentLabel,
  contactPath,
  CS,
  customerSectionOf,
  customerTiles,
  hiddenCommentsText,
  negativeText,
  noCommentsText,
  responsesText,
  scoreChange,
  scoreFigure,
  seeAllHref,
  topText,
  turnedEmpty,
  turnedHeading,
  wasText,
} from './customersText';
import { ME_CUSTOMERS, TEAM_CUSTOMERS } from './testCustomersFixtures';

const SSO: CustomerAsk = { id: 2, title: 'SSO with Okta', status: 'planned', arr: 182000, companies: 3, last_90_days: 12, previous_90_days: 7 };
const SPIKE: CustomerAnomaly = { id: 4, title: 'Similar reports across 2 of your companies', status: 'live', arr: 90000, companies: 2, last_seen_at: '2026-10-04T10:00:00Z' };
const TODAY = new Date('2026-10-05T12:00:00Z');

describe('customersText (customers spec §2.1)', () => {
  it('reads a section from ?section=, and nothing else', () => {
    expect(customerSectionOf('scores')).toBe('scores');
    expect(customerSectionOf('plans')).toBeNull();
    expect(customerSectionOf(null)).toBeNull();
  });

  it('says there are no asks in the scope’s own words', () => {
    expect(asksEmpty('me')).toBe('No asks from your customers yet.');
    expect(asksEmpty('team')).toBe("No asks from your team's customers yet.");
    expect(asksEmpty('company')).toBe('No asks from customers yet.');
  });

  it('words the 90-day trend', () => {
    expect(askTrend({ last_90_days: 12, previous_90_days: 7 })).toBe('12 asks, up from 7');
    expect(askTrend({ last_90_days: 1, previous_90_days: 4 })).toBe('1 ask, down from 4');
    expect(askTrend({ last_90_days: 2, previous_90_days: 2 })).toBe('2 asks, steady');
    expect(askTrend({ last_90_days: 3, previous_90_days: 0 })).toBe('3 asks in 90 days');
    expect(askTrend({ last_90_days: 0, previous_90_days: 0 })).toBe('No asks in six months');
  });

  it('writes an ask’s and an anomaly’s meta line with the status in words', () => {
    expect(askMeta(SSO, 'USD')).toBe('Planned · $182.0K · 3 companies · 12 asks, up from 7');
    expect(askMeta({ ...SSO, status: 'open', arr: 40000, companies: 1, last_90_days: 2, previous_90_days: 2 }, 'USD')).toBe('Open · $40.0K · 1 company · 2 asks, steady');
    expect(anomalyMeta(SPIKE, 'USD')).toBe('Live · $90.0K · 2 companies · last seen 4 Oct');
  });

  it('opens See all in the same scope, and says Top N of M only when there are more', () => {
    expect(seeAllHref('requests', 'team')).toBe('/brain/requests?scope=team');
    expect(seeAllHref('anomalies', 'me')).toBe('/brain/anomalies?scope=me');
    expect(topText(5, 7)).toBe('Top 5 of 7');
    expect(topText(2, 2)).toBeNull();
  });

  it('shows a score, or Not enough answers under 5 (Contract note 5)', () => {
    expect(scoreFigure('nps', { now: 18, then: 25, responses: 22, previous_responses: 19 })).toBe('+18');
    expect(scoreFigure('csat', { now: 82.5, then: 80, responses: 40, previous_responses: 31 })).toBe('82.5%');
    expect(scoreFigure('ces', { now: null, then: null, responses: 3, previous_responses: 0 })).toBe(CS.NOT_ENOUGH);
  });

  it('words the change against the 90 days before, with a tone for its colour', () => {
    expect(scoreChange('nps', { now: 18, then: 25, responses: 22, previous_responses: 19 })).toEqual({ text: 'down 7 pts from +25', tone: 'bad' });
    expect(scoreChange('csat', { now: 82.5, then: 80, responses: 40, previous_responses: 31 })).toEqual({ text: 'up 2.5 pts from 80%', tone: 'good' });
    expect(scoreChange('csat', { now: 81, then: 80, responses: 9, previous_responses: 9 })).toEqual({ text: 'up 1 pt from 80%', tone: 'good' });
    expect(scoreChange('ces', { now: 72.35, then: 72.35, responses: 30, previous_responses: 25 })).toEqual({ text: 'unchanged from 72.35%', tone: 'neutral' });
    expect(scoreChange('nps', { now: 2, then: -4, responses: 6, previous_responses: 6 })).toEqual({ text: 'up 6 pts from −4', tone: 'good' });
    expect(scoreChange('nps', { now: 10, then: null, responses: 6, previous_responses: 2 })).toEqual({ text: CS.NOT_COMPARED, tone: 'neutral' });
    expect(scoreChange('nps', { now: null, then: 25, responses: 2, previous_responses: 19 })).toBeNull();
  });

  it('counts answers now and before', () => {
    expect(responsesText({ now: 18, then: 25, responses: 22, previous_responses: 19 })).toBe('22 answers · 19 before');
    expect(responsesText({ now: null, then: null, responses: 1, previous_responses: 0 })).toBe('1 answer · 0 before');
  });

  it('labels a comment and counts the hidden ones', () => {
    expect(commentLabel({ survey_type: 'nps', score: 4 })).toBe('NPS 4');
    expect(hiddenCommentsText(0)).toBeNull();
    expect(hiddenCommentsText(1)).toBe("1 more comment on a record you can't open");
    expect(hiddenCommentsText(3)).toBe("3 more comments on records you can't open");
  });

  it('says the comments are hidden, not absent, once there are some the reader can’t open (final review #12)', () => {
    expect(noCommentsText(0)).toBe(CS.NO_COMMENTS);
    expect(noCommentsText(2)).toBe('No comments you can open in the last 90 days.');
  });

  it('words sentiment, never by colour alone', () => {
    expect(negativeText(1)).toBe('1 contact negative');
    expect(negativeText(4)).toBe('4 contacts negative');
    expect(wasText('neutral')).toBe('was neutral');
    expect(wasText('')).toBe('had no sentiment before');
    expect(contactPath(41)).toBe('/contacts/41');
  });

  it('heads the turned-negative list from when tracking started (Decision 4)', () => {
    expect(turnedHeading('2026-09-20', TODAY)).toBe('Turned negative since 20 Sep, when we started tracking changes');
    expect(turnedHeading('2026-08-01', TODAY)).toBe(CS.TURNED);
    expect(turnedHeading(null, TODAY)).toBe(CS.TURNED);
    expect(turnedEmpty(null)).toBe(CS.NOT_TRACKING);
    expect(turnedEmpty('2026-08-01')).toBe(CS.NOBODY_TURNED);
  });

  it('parses the date-only `since` at local midnight, so the 30-day boundary is exact (final review #9)', () => {
    // `since`'s local midnight, found independently of the implementation.
    const base = new Date(2026, 8, 6).getTime();
    // Exactly 30 days later: no longer "under 30 days", regardless of the
    // viewer's UTC offset. `Date.parse('2026-09-06')` (UTC midnight) would
    // read this as under 30 days wherever the viewer is ahead of UTC.
    expect(turnedHeading('2026-09-06', new Date(base + 30 * 86_400_000))).toBe(CS.TURNED);
    // One minute inside the 30-day window.
    expect(turnedHeading('2026-09-06', new Date(base + 30 * 86_400_000 - 60_000))).toBe('Turned negative since 6 Sep, when we started tracking changes');
  });
});

describe('customerTiles (brain UI spec §2, Customers)', () => {
  it('reads Asks, Anomalies, NPS, CSAT and Negative contacts from the payload, each jumping to its section', () => {
    expect(customerTiles(TEAM_CUSTOMERS).map((tile) => [tile.label, tile.section])).toEqual([
      ['Asks: 2', 'asks'],
      ['Anomalies: 1', 'anomalies'],
      ['NPS: +18, down 7 pts from +25', 'scores'],
      ['CSAT: 82.5%, up 2.5 pts from 80%', 'scores'],
      ['Negative contacts: 4', 'sentiment'],
    ]);
  });

  it('says "Not enough answers" under 5, with no change, as Scores does', () => {
    const [, , nps, csat] = customerTiles(ME_CUSTOMERS);
    expect(nps).toMatchObject({ figure: CS.NOT_ENOUGH, muted: true, detail: null, label: 'NPS: Not enough answers' });
    expect(csat).toMatchObject({ muted: true, detail: null });
  });
});

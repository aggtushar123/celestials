import { describe, expect, it } from 'vitest';
import type { Skipped } from '../campaigns/campaignTypes';
import type { CampaignReviewDetail, SurveyReviewDetail } from './brainTypes';
import { recordPath, reviewCountsText } from './deskText';

const ZERO_SKIPPED: Skipped = { unsubscribed: 0, no_email: 0, already_received: 0, recent_campaign: 0, over_limit: 0, failed: 0 };
/** A `Skipped` tally totalling `n`, all on one reason (the reason split never matters to `reviewCountsText`, only the sum). */
const skippedOf = (n: number): Skipped => ({ ...ZERO_SKIPPED, unsubscribed: n });
const surveyDetail: SurveyReviewDetail = { rule_id: 3, rule_name: 'Detractor follow-up', review_kind: 'survey', counts: { people: 12, records: 3 }, review: null };
const campaignDetail: CampaignReviewDetail = { rule_id: 4, rule_name: 'Win-back', review_kind: 'campaign', counts: { reach: 40, skipped: skippedOf(2) }, review: null };

describe('what a desk item says', () => {
  it('words a rule review’s counts per review_kind, singular where it applies (controller override)', () => {
    expect(reviewCountsText(surveyDetail)).toBe('12 people across 3 records');
    expect(reviewCountsText({ ...surveyDetail, counts: { people: 1, records: 1 } })).toBe('1 person across 1 record');
    expect(reviewCountsText(campaignDetail)).toBe('40 to email · 2 skipped');
    expect(reviewCountsText({ ...campaignDetail, counts: { reach: 40, skipped: ZERO_SKIPPED } })).toBe('40 to email');
    expect(reviewCountsText({ ...campaignDetail, counts: { reach: 40, skipped: skippedOf(1) } })).toBe('40 to email · 1 skipped');
  });

  it('sums `skipped` across every reason (fix round 1: the backend stores a tally, not a number)', () => {
    const spread: Skipped = { ...ZERO_SKIPPED, unsubscribed: 1, no_email: 2, recent_campaign: 3 };
    expect(reviewCountsText({ ...campaignDetail, counts: { reach: 40, skipped: spread } })).toBe('40 to email · 6 skipped');
  });

  it('links records where they live today (Contract note 3)', () => {
    expect(recordPath({ type: 'customer', id: 6, name: 'Pizza Hut' })).toBe('/organizations/6');
    expect(recordPath({ type: 'account', id: 9, name: 'Uber EMEA' })).toBe('/accounts/9');
  });
});

// Words Brain's pages and My work share about a desk item's record and a
// rule review's counts (moved from Waiting on you's word file when that
// page went, work in one place delivery 2).
import { skippedTotal } from '../campaigns/campaignText';
import { recordHref } from '../segments/segmentFields';
import type { RuleReviewDetail, WaitingRecord } from './brainTypes';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "12 people across 3 records" for a survey, "40 to email · 2 skipped" for a campaign. */
export function reviewCountsText(detail: RuleReviewDetail): string {
  if (detail.review_kind === 'survey') {
    const { people, records } = detail.counts;
    return `${people} ${plural(people, 'person', 'people')} across ${records} ${plural(records, 'record', 'records')}`;
  }
  const { reach, skipped } = detail.counts;
  const total = skippedTotal(skipped);
  return total > 0 ? `${reach} to email · ${total} skipped` : `${reach} to email`;
}

export function recordPath(record: WaitingRecord): string {
  return recordHref(record.type, record.id);
}

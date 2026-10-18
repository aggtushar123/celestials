// The Surveys pages' sentences, as data: each figure apart from its words so
// the page can set it in DM Mono.
import { formatDate } from '../customers/formatters';
import { localDay } from '../organizations/storyDays';
import type { SegmentKind } from '../segments/segmentTypes';
import { PER_RECORD_CAP } from './questions';
import type { AudienceCounts, RecordRef, SegmentRef, SendCounts } from './surveyTypes';

/** One figure and the words after it: "6" "skipped (…)". */
export interface Line {
  n: number;
  text: string;
}

export interface Reach {
  people: number;
  peopleNoun: string;
  records: number;
  recordNoun: string;
}

type Skips = Pick<AudienceCounts, 'skipped_recent' | 'skipped_no_email' | 'skipped_cap'>;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "42 people at 18 organisations" (plan Decision 13: accounts for an
 *  account segment). */
export function reach(counts: Pick<AudienceCounts, 'audience' | 'organisations'>, kind: SegmentKind | null): Reach {
  const records = counts.organisations;
  return {
    people: counts.audience,
    peopleNoun: plural(counts.audience, 'person', 'people'),
    records,
    recordNoun: kind === 'account' ? plural(records, 'account', 'accounts') : plural(records, 'organisation', 'organisations'),
  };
}

/** The skips, counted and never named (spec §1.2). */
export function skipLines(counts: Skips): Line[] {
  const lines: Line[] = [];
  if (counts.skipped_recent > 0) lines.push({ n: counts.skipped_recent, text: 'skipped (surveyed in the last 30 days)' });
  if (counts.skipped_no_email > 0) lines.push({ n: counts.skipped_no_email, text: 'without an email' });
  if (counts.skipped_cap > 0) lines.push({ n: counts.skipped_cap, text: `over the limit of ${PER_RECORD_CAP} per organisation or account` });
  return lines;
}

export function hiddenLine(counts: Pick<AudienceCounts, 'hidden_count'>): Line | null {
  const n = counts.hidden_count;
  if (n === 0) return null;
  return { n, text: `in the segment you can't open ${n === 1 ? "isn't" : "aren't"} included` };
}

/** Why Send is off, in the backend's own words (contract gap 2), or null. */
export function sendBlocker(counts: Pick<AudienceCounts, 'audience' | 'limit'>): string | null {
  if (counts.audience === 0) return 'Nobody to send to.';
  if (counts.audience > counts.limit) return `This survey would reach ${counts.audience} people; the most is ${counts.limit}.`;
  return null;
}

export function sendLabel(people: number): string {
  return `Send to ${people} ${plural(people, 'person', 'people')}…`;
}

/** A sent survey's frozen counts, for its owner. */
export function countsLines(counts: SendCounts): Line[] {
  return [
    { n: counts.audience, text: plural(counts.audience, 'person', 'people') },
    { n: counts.sent, text: 'sent' },
    ...(counts.failed > 0 ? [{ n: counts.failed, text: 'not delivered' }] : []),
    ...skipLines(counts),
  ];
}

export function segmentLabel(segment: SegmentRef | null): string {
  return segment === null ? 'Deleted segment' : segment.name;
}

/** "3 Oct 2026", on the reader's own calendar. */
export function dayLabel(iso: string): string {
  return formatDate(localDay(new Date(iso)));
}

export function recordPath(record: RecordRef): string {
  return record.kind === 'account' ? `/accounts/${record.id}` : `/organizations/${record.id}`;
}

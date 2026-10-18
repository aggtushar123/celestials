// What "What customers are saying" says (spec 2026-10-05-brain-customers-design
// §2.1), in one place so the tests and the page share it.
import { STATUS_LABELS as ANOMALY_STATUS } from '../anomalies/anomaliesApi';
import type { CurrencyCode } from '../auth/authSlice';
import { formatCompactMoney } from '../customers/formatters';
import { STATUS_LABELS as REQUEST_STATUS } from '../requests/types';
import { formatFigure, TYPE_LABEL } from '../surveys/questions';
import type { SurveyType } from '../surveys/surveyTypes';
import { dayOf, type Tone } from './brainText';
import type { ContactSentiment, CustomerAnomaly, CustomerAsk, CustomersPayload, ScoreComment, ScoreFigure, ScopeKey } from './brainTypes';

export const CS = {
  TITLE: 'What customers are saying',
  SECTIONS: 'Sections',
  ASKS: 'Asks',
  ANOMALIES: 'Anomalies',
  SCORES: 'Scores',
  SENTIMENT: 'Sentiment',
  NEGATIVE: 'Negative contacts',
  BACK: 'Customers',
  LOAD: 'Could not load what customers are saying.',
  LOADING: 'Loading what customers are saying',
  GRAPH: 'See on the graph',
  SEE_ALL: 'See all',
  SEE_ALL_ASKS: 'See all asks',
  SEE_ALL_ANOMALIES: 'See all anomalies',
  NO_ANOMALIES: 'Nothing unusual right now.',
  NOT_ENOUGH: 'Not enough answers',
  NOT_COMPARED: 'Too few answers before to compare',
  COMMENTS: 'Latest comments',
  NO_COMMENTS: 'No comments in the last 90 days.',
  TURNED: 'Turned negative in the last 30 days',
  TURNED_LIST: 'Turned negative',
  NOBODY_TURNED: 'Nobody turned negative in the last 30 days.',
  NOT_TRACKING: 'Nobody has turned negative since we started tracking changes.',
} as const;

export type CustomerSectionKey = 'asks' | 'anomalies' | 'scores' | 'sentiment';
export const CUSTOMER_SECTIONS: readonly { key: CustomerSectionKey; label: string }[] = [
  { key: 'asks', label: CS.ASKS },
  { key: 'anomalies', label: CS.ANOMALIES },
  { key: 'scores', label: CS.SCORES },
  { key: 'sentiment', label: CS.SENTIMENT },
];

export function customerSectionOf(param: string | null): CustomerSectionKey | null {
  return CUSTOMER_SECTIONS.some((s) => s.key === param) ? (param as CustomerSectionKey) : null;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const companiesText = (n: number) => count(n, 'company', 'companies');

export function asksEmpty(scope: ScopeKey): string {
  if (scope === 'me') return 'No asks from your customers yet.';
  if (scope === 'team') return "No asks from your team's customers yet.";
  return 'No asks from customers yet.';
}

/** "12 asks, up from 7" (spec §2.1). */
export function askTrend(ask: Pick<CustomerAsk, 'last_90_days' | 'previous_90_days'>): string {
  const { last_90_days: now, previous_90_days: before } = ask;
  if (now === 0 && before === 0) return 'No asks in six months';
  const asks = count(now, 'ask', 'asks');
  if (before === 0) return `${asks} in 90 days`;
  if (now === before) return `${asks}, steady`;
  return `${asks}, ${now > before ? 'up' : 'down'} from ${before}`;
}

export function askMeta(ask: CustomerAsk, currency: CurrencyCode): string {
  return [REQUEST_STATUS[ask.status], formatCompactMoney(ask.arr, currency), companiesText(ask.companies), askTrend(ask)].join(' · ');
}

export function anomalyMeta(anomaly: CustomerAnomaly, currency: CurrencyCode): string {
  return [ANOMALY_STATUS[anomaly.status], formatCompactMoney(anomaly.arr, currency), companiesText(anomaly.companies), `last seen ${dayOf(anomaly.last_seen_at)}`].join(' · ');
}

/** Decision 2: See all opens the full page in the same scope. */
export function seeAllHref(page: 'requests' | 'anomalies', scope: ScopeKey): string {
  return `/brain/${page}?scope=${scope}`;
}

export function topText(shown: number, total: number): string | null {
  return total > shown ? `Top ${shown} of ${total}` : null;
}

export const SCORE_KINDS: readonly SurveyType[] = ['nps', 'csat', 'ces'];

export function scoreFigure(type: SurveyType, s: ScoreFigure): string {
  return s.now === null ? CS.NOT_ENOUGH : formatFigure(type, s.now);
}

/** The change against the 90 days before, in words; higher is better for all three. */
export function scoreChange(type: SurveyType, s: ScoreFigure): { text: string; tone: Tone } | null {
  if (s.now === null) return null;
  if (s.then === null) return { text: CS.NOT_COMPARED, tone: 'neutral' };
  const change = Math.round((s.now - s.then) * 10) / 10;
  const from = `from ${formatFigure(type, s.then)}`;
  if (change === 0) return { text: `unchanged ${from}`, tone: 'neutral' };
  const size = Math.abs(change);
  return { text: `${change > 0 ? 'up' : 'down'} ${size} ${size === 1 ? 'pt' : 'pts'} ${from}`, tone: change > 0 ? 'good' : 'bad' };
}

export function responsesText(s: ScoreFigure): string {
  return `${count(s.responses, 'answer', 'answers')} · ${s.previous_responses} before`;
}

export function commentLabel(c: Pick<ScoreComment, 'survey_type' | 'score'>): string {
  return `${TYPE_LABEL[c.survey_type]} ${c.score}`;
}

export function hiddenCommentsText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more comment on a record you can't open" : `${n} more comments on records you can't open`;
}

/** Ruling (final review #12): when the window has comments but none the
 *  reader can open, say so, rather than imply there are none at all. */
export function noCommentsText(hidden: number): string {
  return hidden > 0 ? "No comments you can open in the last 90 days." : CS.NO_COMMENTS;
}

export function negativeText(n: number): string {
  return `${count(n, 'contact', 'contacts')} negative`;
}

export function wasText(previous: ContactSentiment): string {
  return previous ? `was ${previous}` : 'had no sentiment before';
}

export function contactPath(id: number): string {
  return `/contacts/${id}`;
}

const DAY = 86_400_000;

/** `since` is a date-only string (YYYY-MM-DD); parsed at local midnight, the
 *  same convention `dayMonth` reads a date by, rather than `Date.parse`'s
 *  UTC midnight (final review #9). `today` is a real local Date, so parsing
 *  `since` in the same frame keeps the 30-day boundary exact instead of
 *  drifting by the viewer's UTC offset. */
function localMidnight(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Decision 4: until 30 days of changes are on record, the list says since when. */
export function turnedHeading(since: string | null, today: Date): string {
  if (since && today.getTime() - localMidnight(since) < 30 * DAY) return `Turned negative since ${dayOf(since)}, when we started tracking changes`;
  return CS.TURNED;
}

export function turnedEmpty(since: string | null): string {
  return since === null ? CS.NOT_TRACKING : CS.NOBODY_TURNED;
}

export interface CustomerTile {
  key: string;
  title: string;
  section: CustomerSectionKey;
  figure: string;
  /** "Not enough answers": set at 13px, not as a 22px figure. */
  muted: boolean;
  detail: { text: string; tone: Tone } | null;
  /** The tile's accessible name: "NPS: +18, down 7 pts from +25". */
  label: string;
}

/** The five tiles (brain UI spec §2), from the `customers/` payload the page
 *  already reads. NPS and CSAT reuse Scores' figure and change words. The
 *  anomalies tile is the total, every status, as the section's "Top 5 of N". */
export function customerTiles(data: Pick<CustomersPayload, 'asks' | 'anomalies' | 'scores' | 'sentiment'>): CustomerTile[] {
  const tile = (key: string, title: string, section: CustomerSectionKey, figure: string, muted = false, detail: CustomerTile['detail'] = null): CustomerTile => ({
    key,
    title,
    section,
    figure,
    muted,
    detail,
    label: `${title}: ${figure}${detail ? `, ${detail.text}` : ''}`,
  });
  const score = (kind: 'nps' | 'csat') => {
    const figure = data.scores[kind];
    return tile(kind, TYPE_LABEL[kind], 'scores', scoreFigure(kind, figure), figure.now === null, scoreChange(kind, figure));
  };
  return [
    tile('asks', CS.ASKS, 'asks', String(data.asks.total)),
    tile('anomalies', CS.ANOMALIES, 'anomalies', String(data.anomalies.total)),
    score('nps'),
    score('csat'),
    tile('negative', CS.NEGATIVE, 'sentiment', String(data.sentiment.negative)),
  ];
}

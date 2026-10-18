// What the Maps tab, the gallery and the editor say (spec §2.1-§2.3).
import { dayMonth } from '../contacts/contactsFormat';
import { formatRelativeTime } from '../customers/formatters';
import { NAME_MAX, NO_LABEL, STALE_DAYS, SURVEY_LABEL } from './canvasOptions';
import type { CanvasRow, LatestSurvey, MapPerson, Reading, RelationshipLabel } from './canvasTypes';

const DAY = 86_400_000;

export const peopleText = (n: number) => (n === 1 ? 'person' : 'people');

export function defaultMapName(recordName: string | null): string {
  return recordName ? `${recordName} map`.slice(0, NAME_MAX) : 'New map';
}

/** The slug for the dot, the server's word to read (Contract note 4). */
export function sentimentOf(person: Pick<MapPerson, 'sentiment' | 'sentiment_label'>): { reading: Reading; word: string } {
  return { reading: person.sentiment, word: person.sentiment_label };
}

/** "Contacted 12 days ago": the figure apart, for DM Mono. */
export interface Contacted {
  stale: boolean;
  lead: string;
  figure: string | null;
  tail: string;
}

export function contacted(iso: string | null, now: Date = new Date()): Contacted {
  if (!iso) return { stale: true, lead: 'Not contacted yet', figure: null, tail: '' };
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
  if (days >= STALE_DAYS) return { stale: true, lead: 'Not contacted in ', figure: `${STALE_DAYS}+`, tail: ' days' };
  if (days === 0) return { stale: false, lead: 'Contacted today', figure: null, tail: '' };
  return { stale: false, lead: 'Contacted ', figure: String(days), tail: days === 1 ? ' day ago' : ' days ago' };
}

export const contactedText = (c: Contacted) => `${c.lead}${c.figure ?? ''}${c.tail}`;

export function surveyParts(s: LatestSurvey): { label: string; score: string; day: string } {
  return { label: SURVEY_LABEL[s.type], score: String(s.score), day: dayMonth(s.answered_at) };
}

export function surveyText(s: LatestSurvey): string {
  const p = surveyParts(s);
  return `${p.label} ${p.score} · ${p.day}`;
}

export function editedBy(row: Pick<CanvasRow, 'updated_at' | 'updated_by'>): { who: string | null; when: string } {
  return { who: row.updated_by?.name ?? null, when: formatRelativeTime(row.updated_at) };
}

export function editedText(row: Pick<CanvasRow, 'updated_at' | 'updated_by'>): string {
  const e = editedBy(row);
  return e.who ? `Edited by ${e.who} · ${e.when}` : `Edited ${e.when}`;
}

export const labelText = (label: RelationshipLabel) => label || NO_LABEL;

const VERB: Record<RelationshipLabel, string> = {
  'Reports to': 'reports to',
  'Introduced by': 'was introduced by',
  Blocks: 'blocks',
  Influences: 'influences',
  '': 'is linked to',
};

/** "A reports to B" (spec §2.2, phones). */
export function relationshipText(source: string, label: RelationshipLabel, target: string): string {
  return `${source} ${VERB[label]} ${target}`;
}

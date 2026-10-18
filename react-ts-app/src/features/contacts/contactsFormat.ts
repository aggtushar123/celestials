import type { CompanyRef, Contact } from '../customers/customersSlice';
import type { Analysis, Classification, ContactHistory, ReadableEvidence, Reading } from './contactsTypes';
import type { BadgeTone } from '../../components/ui/Badge';

// The words and tones the Contacts page and the organisation page's calls
// use for people, sentiment and a record's reading (spec 2026-09-28 §3, §5).

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SENTIMENT_LABEL: Record<Reading, string> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

/** A reading as a pill. */
export const SENTIMENT_PILL: Record<Reading, string> = {
  positive: 'bg-success-dim text-success',
  neutral: 'bg-subtle text-ink-muted',
  negative: 'bg-danger-dim text-danger',
};

/** A person's sentiment as a word in its colour, with a dot. */
export const SENTIMENT_TEXT: Record<Reading, string> = {
  positive: 'text-success-ink',
  neutral: 'text-ink-muted',
  negative: 'text-danger-ink',
};
export const SENTIMENT_DOT: Record<Reading, string> = {
  positive: 'bg-success',
  neutral: 'bg-line-strong',
  negative: 'bg-danger',
};

/** What a call, email or ticket reads as: its sentiment, "Not enough to
 *  analyse", or nothing while it waits to be read. A record from before
 *  `analysis` existed shows its sentiment, as it did. */
export function readingOf(record: { analysis?: Analysis; sentiment: string | null }): { label: string; tone: string } | null {
  if (record.analysis === 'not_analysable') return { label: 'Not enough to analyse', tone: 'bg-subtle text-ink-muted' };
  if (record.analysis === 'pending') return null;
  const sentiment = record.sentiment as Reading | null;
  if (!sentiment || !(sentiment in SENTIMENT_LABEL)) return null;
  return { label: SENTIMENT_LABEL[sentiment], tone: SENTIMENT_PILL[sentiment] };
}

const READING_TONE: Record<Reading, BadgeTone> = { positive: 'success', neutral: 'neutral', negative: 'danger' };

/** readingOf for a Badge (UI foundations spec §5.7): the same words, the
 *  shared tone map's tones. */
export function readingBadge(record: { analysis?: Analysis; sentiment: string | null }): { label: string; tone: BadgeTone } | null {
  if (record.analysis === 'not_analysable') return { label: 'Not enough to analyse', tone: 'neutral' };
  if (record.analysis === 'pending') return null;
  const sentiment = record.sentiment as Reading | null;
  if (!sentiment || !(sentiment in SENTIMENT_LABEL)) return null;
  return { label: SENTIMENT_LABEL[sentiment], tone: READING_TONE[sentiment] };
}

/** "12 Sep", in UTC so a day never moves with the viewer's zone. */
export function dayMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "12 Sep 2026". */
export function dayLabel(iso: string): string {
  return `${dayMonth(iso)} ${new Date(iso).getUTCFullYear()}`;
}

function listJoin(parts: string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The evidence a person's sentiment rests on that the viewer can open:
 *  `history.sentiment_readable` when the backend serves that key (new
 *  shape, even when it is `null` for a hand-set sentiment), or, on the old
 *  shape (revenact-backend before PR fix/contacts-readable-evidence, no
 *  `sentiment_readable` key at all), `sentiment_evidence` mapped into the
 *  same shape with `others: false` — the old shape never said whether the
 *  stored sentiment also rested on records the viewer could not open. */
export function readableEvidenceOf(history: Pick<ContactHistory, 'sentiment_evidence' | 'sentiment_readable'>): ReadableEvidence | null {
  if (history.sentiment_readable !== undefined) return history.sentiment_readable;
  const e = history.sentiment_evidence;
  if (!e || !('calls' in e)) return null;
  const { calls, emails, tickets, positive, neutral, negative, latest_at } = e;
  return { calls, emails, tickets, positive, neutral, negative, latest_at, others: false };
}

/** Why a person reads as they do: "Neutral: 3 positive · 2 neutral · 1
 *  negative across 6 calls and 2 emails, latest 12 Sep". A hand-set one
 *  says so, and, when `analysedCalls` of theirs have been read, that the
 *  nightly run reads their calls again (never that nothing was analysed).
 *  When the stored sentiment also rests on records the viewer cannot open
 *  (`evidence.others`), that is said too — after the sentence when some of
 *  it is readable, or alone when none of it is. Never shows a number that
 *  isn't in `evidence`. */
export function sentimentWhy(
  sentiment: Reading,
  source: Contact['sentiment_source'],
  evidence: ReadableEvidence | null | undefined,
  analysedCalls = 0,
): string {
  const label = SENTIMENT_LABEL[sentiment];
  if (source === 'manual') {
    return analysedCalls > 0 ? `${label}. Set by hand; their calls will be read again tonight.` : `${label}. Set by hand.`;
  }
  if (!evidence || evidence.calls + evidence.emails + evidence.tickets === 0) {
    return evidence?.others ? `${label}, from records you can't open.` : `${label}. Nothing of theirs has been analysed yet.`;
  }
  const kinds = listJoin(
    [
      evidence.calls ? `${evidence.calls} ${plural(evidence.calls, 'call', 'calls')}` : '',
      evidence.emails ? `${evidence.emails} ${plural(evidence.emails, 'email', 'emails')}` : '',
      evidence.tickets ? `${evidence.tickets} ${plural(evidence.tickets, 'ticket', 'tickets')}` : '',
    ].filter(Boolean),
  );
  const latest = evidence.latest_at ? `, latest ${dayMonth(evidence.latest_at)}` : '';
  const rest = evidence.others ? " Also rests on records you can't open." : '';
  return `${label}: ${evidence.positive} positive · ${evidence.neutral} neutral · ${evidence.negative} negative across ${kinds}${latest}${rest}`;
}

/** "n calls" beside a person's sentiment, or where it came from. Reads
 *  `contact.calls` (new shape) first, falling back to the old shape's
 *  `sentiment_evidence.calls` — and never throws when neither is served. */
export function callsLabel(contact: Contact): string {
  const evidence = contact.sentiment_evidence;
  const calls = typeof contact.calls === 'number' ? contact.calls : evidence && 'calls' in evidence ? (evidence.calls ?? 0) : 0;
  if (calls) return `${calls} ${plural(calls, 'call', 'calls')}`;
  return contact.sentiment_source === 'manual' ? 'set by hand' : 'no calls';
}

/** "Customer Success › Account Management", blank parts left out. */
export function classificationLabel(c: Classification): string {
  return [c.area, c.category, c.subcategory].filter(Boolean).join(' › ');
}

/** A person's organisation and account, from the refs the list serves, or
 *  from the older fields a record from before them carries. */
export function placeOf(contact: Contact): { organisation: CompanyRef | null; account: CompanyRef | null } {
  const organisation = contact.organisation !== undefined ? contact.organisation : (contact.companies[0] ?? null);
  const account =
    contact.account !== undefined
      ? contact.account
      : contact.account_id && contact.account_name
        ? { id: contact.account_id, name: contact.account_name }
        : null;
  return { organisation, account };
}

/** "Kraft Heinz › EMEA", or the organisation alone. */
export function placeLabel(place: { organisation: CompanyRef | null; account: CompanyRef | null }): string {
  return [place.organisation?.name, place.account?.name].filter(Boolean).join(' › ');
}

/** Only http(s) lands in an href. */
export function safeUrl(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

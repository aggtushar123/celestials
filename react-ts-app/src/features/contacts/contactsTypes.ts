import type { CompanyRef, Contact, ContactSentimentEvidence } from '../customers/customersSlice';

// The Contacts page's backend contract (revenact-backend
// docs/API_CONTRACTS.md: GET /api/v1/contacts/ and
// GET /api/v1/contacts/<id>/history/).

/** Whether a record has been read: `pending` (not yet), `not_analysable`
 *  (a call with nothing to judge) or `analysed`. */
export type Analysis = 'pending' | 'not_analysable' | 'analysed';

export type Reading = Contact['sentiment'];

/** Over the whole filtered set, not the page. */
export interface ContactsSummary {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  decision_makers: number;
  /** Optional: served from backend PR #71 on; a response without it
   *  leaves "n active" out of the summary line. */
  active?: number;
  /** Against the total of 30 days ago; null when there was nobody then (a
   *  change off zero is undefined). Optional as `active` is. */
  growth_30d_pct?: number | null;
}

export interface ContactsPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: Contact[];
  /** Optional: a response from before the redesign has none. */
  summary?: ContactsSummary;
}

export interface Classification {
  area: string;
  category: string;
  subcategory: string;
}

interface HistoryRow {
  id: number;
  analysis: Analysis;
  /** Null unless `analysis` is `analysed`. */
  sentiment: Reading | null;
  classification: Classification;
  organisation: CompanyRef | null;
  account: CompanyRef | null;
}

export interface HistoryCall extends HistoryRow {
  title: string;
  occurred_at: string;
  duration_minutes: number | null;
  host_name: string;
  summary: string;
  link: { url: string | null };
}

export interface HistoryEmail extends HistoryRow {
  subject: string;
  sent_at: string;
  sender_name: string;
  snippet: string;
  /** Null when the backend cannot thread the email; the app has no page
   *  for a thread outside an organisation's Story either way (an email
   *  never links). */
  link: { thread_id: string | null };
}

export interface HistoryTicket extends HistoryRow {
  ticket_number: string;
  title: string;
  status: string;
  status_display: string;
  /** Optional: a response from before the ticket connectors carried a
   *  department reads as null/undefined, and the row shows status alone. */
  department_display?: string | null;
  opened_at: string;
  link: { url: string | null };
}

/** Sentiment counted only over the viewer's readable, analysed calls,
 *  emails and tickets (revenact-backend PR fix/contacts-readable-evidence).
 *  `others` is true when the stored sentiment also rests on records the
 *  viewer cannot open. */
export interface ReadableEvidence {
  calls: number;
  emails: number;
  tickets: number;
  positive: number;
  neutral: number;
  negative: number;
  latest_at: string | null;
  others: boolean;
}

/** Newest first, the newest 100 of each kind; `counts` are the visible totals. */
export interface ContactHistory {
  contact_id: number;
  sentiment: Reading;
  sentiment_source: Contact['sentiment_source'];
  /** Old shape: revenact-backend PR fix/contacts-readable-evidence removes
   *  this field in favour of `sentiment_readable` below. Kept optional
   *  only until that backend change is live (this frontend deploys
   *  first); do not add new reads of it beyond `readableEvidenceOf`'s
   *  fallback in contactsFormat.ts. */
  sentiment_evidence?: ContactSentimentEvidence | Record<string, never>;
  /** New shape: counted only over the viewer's readable analysed records;
   *  `null` for a hand-set sentiment. Absent (`undefined`) only when
   *  served by the old backend shape, which has no equivalent key. */
  sentiment_readable?: ReadableEvidence | null;
  counts: { calls: number; emails: number; tickets: number };
  calls: HistoryCall[];
  emails: HistoryEmail[];
  tickets: HistoryTicket[];
}

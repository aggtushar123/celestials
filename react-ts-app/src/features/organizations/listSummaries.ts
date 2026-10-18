import type { CurrencyCode } from '../auth/authSlice';
import { durationLabel } from '../calls/callFormat';
import type { Call } from '../calls/callsSlice';
import type { Contact, Opportunity, Risk } from '../customers/customersSlice';
import { formatMoney } from '../customers/formatters';

// The one-line summaries above the organization page's lists (spec
// 2026-09-27 §2–4). They replace the stat cards with the same figures, over
// the records the account chip selects.

export interface SummaryPart {
  /** Shown in DM Mono. */
  value: string;
  label: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const DECISION_ROLES: ReadonlySet<Contact['role']> = new Set(['executive_sponsor', 'decision_maker', 'economic_buyer']);
const sumMrr = (rows: { mrr: string }[]) => rows.reduce((sum, row) => sum + Number(row.mrr), 0);

export function peopleSummary(people: Contact[]): SummaryPart[] {
  const n = people.length;
  const deciders = people.filter((person) => DECISION_ROLES.has(person.role)).length;
  const active = people.filter((person) => person.status === 'active').length;
  const positive = people.filter((person) => person.sentiment === 'positive').length;
  return [
    { value: String(n), label: plural(n, 'person', 'people') },
    { value: String(deciders), label: plural(deciders, 'decision maker', 'decision makers') },
    { value: String(active), label: 'active' },
    { value: `${n ? Math.round((positive / n) * 100) : 0}%`, label: 'positive sentiment' },
  ];
}

export function opportunitiesSummary(rows: Opportunity[], currency: CurrencyCode): SummaryPart[] {
  return [
    { value: String(rows.length), label: plural(rows.length, 'opportunity', 'opportunities') },
    // Closed Lost is out of the pipeline (pipelines spec 2026-09-30 §1).
    { value: formatMoney(sumMrr(rows.filter((row) => row.stage !== 'closed_lost')), currency), label: 'pipeline MRR' },
    { value: String(rows.filter((row) => row.priority === 'high').length), label: 'high priority' },
    { value: String(rows.filter((row) => row.stage === 'closed_won').length), label: 'closed won' },
  ];
}

export function risksSummary(rows: Risk[], currency: CurrencyCode): SummaryPart[] {
  return [
    { value: String(rows.length), label: plural(rows.length, 'risk', 'risks') },
    { value: formatMoney(sumMrr(rows), currency), label: 'MRR at risk' },
    { value: String(rows.filter((row) => row.priority === 'high').length), label: 'high priority' },
    { value: String(rows.filter((row) => row.stage === 'realised').length), label: 'realised' },
  ];
}

export function callsSummary(calls: Call[]): SummaryPart[] {
  const minutes = calls.reduce((sum, call) => sum + (call.duration_minutes ?? 0), 0);
  const count = (sentiment: Call['sentiment']) => String(calls.filter((call) => call.sentiment === sentiment).length);
  return [
    { value: String(calls.length), label: plural(calls.length, 'call', 'calls') },
    ...(minutes > 0 ? [{ value: durationLabel(minutes), label: 'on calls' }] : []),
    { value: count('positive'), label: 'positive' },
    { value: count('neutral'), label: 'neutral' },
    { value: count('negative'), label: 'negative' },
  ];
}

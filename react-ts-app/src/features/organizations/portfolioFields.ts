import type { ColumnId } from '../../components/organizations/tableData';
import { formatDate, formatMoney } from '../customers/formatters';
import { BASE_SORT_KEYS, NUMERIC_SORT_KEYS } from './portfolioParams';
import type { PortfolioRow } from './portfolioTypes';

// Every field the old 34-column table showed, with the one place the
// portfolio shows it (spec §1 "Opened row"). The coverage test renders a
// row and asserts each id appears exactly once, so this is the checklist.

export type PanelKey = 'commercial' | 'contract' | 'adoption' | 'voice' | 'profile' | 'history';

export const PANELS: { key: PanelKey; title: string }[] = [
  { key: 'commercial', title: 'Commercial' },
  { key: 'contract', title: 'Contract timeline' },
  { key: 'adoption', title: 'Adoption' },
  { key: 'voice', title: 'Voice of the customer' },
  { key: 'profile', title: 'Profile' },
  { key: 'history', title: 'History' },
];

export const PANEL_ORDER: Record<PanelKey, ColumnId[]> = {
  commercial: ['arrAccount', 'arrHQ', 'tcv', 'tcvRenewal', 'implFee'],
  contract: ['joinedDate', 'contractStart', 'renewalDate', 'contractEnd'],
  adoption: ['totalContractedSeats', 'totalActiveSeats', 'totalSeatUtilization', 'totalHires', 'productsUtilized', 'scopeWebApp'],
  voice: ['nps', 'csatScore', 'cesPercentage', 'aiPulseReason'],
  profile: ['revenactId', 'domain', 'nameAddress', 'topSourceChannel'],
  history: ['createdBy', 'modifiedBy', 'churnDate', 'churnReason', 'churnComment'],
};

export interface FieldDef {
  id: ColumnId;
  /** Label in the opened row and the pin menu. */
  label: string;
  /** Label on a pinned chip ("NPS −80", "Seats 16%"). */
  short: string;
  place: 'header' | PanelKey;
  value: (row: PortfolioRow) => string;
}

const DASH = '—';
const count = (n: number | null) => (n == null ? DASH : n.toLocaleString('en-US'));
const pct = (n: number | null) => (n == null ? DASH : `${n}%`);
const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : DASH);
const text = (s: string) => s.trim() || DASH;
const money = (row: PortfolioRow, n: number | null) =>
  n == null ? DASH : formatMoney(n, row.details.commercial.currency);
const stamp = (by: string | null, at: string | null) => `${by ?? 'System'} · ${day(at)}`;

/** The stored pulse dots, in words: 1 good, 2 poor, 3 mixed, 0 no signal. */
export const PULSE_WORD: Record<number, string> = { 1: 'good', 2: 'poor', 3: 'mixed', 0: 'no signal' };
export function pulseWords(history: number[]): string {
  return history.length ? history.map((n) => PULSE_WORD[n] ?? 'no signal').join(', ') : DASH;
}

/** NPS-style signed number with a real minus sign. */
export function signed(n: number | null): string {
  if (n == null) return DASH;
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

type Def = Omit<FieldDef, 'id'>;
const defs: Record<ColumnId, Def> = {
  organization: { label: 'Organization', short: 'Name', place: 'header', value: (r) => r.name },
  owner: { label: 'Owner', short: 'Owner', place: 'header', value: (r) => r.owner?.name ?? 'Unassigned' },
  lifecycleStage: { label: 'Lifecycle stage', short: 'Lifecycle', place: 'header', value: (r) => r.lifecycle.label },
  health: {
    label: 'Health',
    short: 'Health',
    place: 'header',
    value: (r) => r.health.score.toFixed(1),
  },
  // The old "Pulse" column was the stored dots; "AI Pulse Score" was the AI
  // category label. Same mapping as the backend's fields.FIELDS.
  pulse: { label: 'Pulse', short: 'Pulse', place: 'header', value: (r) => pulseWords(r.pulse.history) },
  aiPulseScore: { label: 'AI pulse score', short: 'AI pulse', place: 'header', value: (r) => text(r.pulse.ai_label) },

  arrAccount: { label: 'ARR billed at account', short: 'ARR', place: 'commercial', value: (r) => money(r, r.details.commercial.arr_billed_at_account) },
  arrHQ: { label: 'ARR billed at HQ', short: 'ARR HQ', place: 'commercial', value: (r) => money(r, r.details.commercial.arr_billed_at_hq) },
  tcv: { label: 'Total contract value', short: 'TCV', place: 'commercial', value: (r) => money(r, r.details.commercial.total_contract_value) },
  tcvRenewal: { label: 'Forecasted renewal revenue', short: 'Renewal rev.', place: 'commercial', value: (r) => money(r, r.details.commercial.total_forecasted_renewal_revenue) },
  implFee: { label: 'Implementation fee', short: 'Impl. fee', place: 'commercial', value: (r) => money(r, r.details.commercial.implementation_fee) },

  joinedDate: { label: 'Joined', short: 'Joined', place: 'contract', value: (r) => day(r.details.contract.joined_date) },
  contractStart: { label: 'Contract start', short: 'Start', place: 'contract', value: (r) => day(r.details.contract.contract_start_date) },
  renewalDate: { label: 'Renewal', short: 'Renews', place: 'contract', value: (r) => day(r.details.contract.renewal_date) },
  contractEnd: { label: 'Contract end', short: 'Ends', place: 'contract', value: (r) => day(r.details.contract.contract_end_date) },

  totalContractedSeats: { label: 'Contracted seats', short: 'Contracted', place: 'adoption', value: (r) => count(r.details.adoption.total_contracted_seats) },
  totalActiveSeats: { label: 'Active seats', short: 'Active', place: 'adoption', value: (r) => count(r.details.adoption.total_active_seats) },
  totalSeatUtilization: { label: 'Seat utilisation', short: 'Seats', place: 'adoption', value: (r) => pct(r.details.adoption.seat_utilization_percentage) },
  totalHires: { label: 'Total hires', short: 'Hires', place: 'adoption', value: (r) => count(r.details.adoption.total_hires) },
  productsUtilized: {
    label: 'Products',
    short: 'Products',
    place: 'adoption',
    // "Core (+2)", as the export prints it.
    value: (r) => {
      const { primary, additional_count } = r.details.adoption.products;
      if (!primary) return DASH;
      return additional_count ? `${primary.name} (+${additional_count})` : primary.name;
    },
  },
  scopeWebApp: { label: 'Scope web app', short: 'Web app', place: 'adoption', value: (r) => text(r.details.adoption.scope_web_app) },

  nps: { label: 'NPS', short: 'NPS', place: 'voice', value: (r) => signed(r.details.voice.nps_score) },
  csatScore: { label: 'CSAT', short: 'CSAT', place: 'voice', value: (r) => pct(r.details.voice.csat_score) },
  cesPercentage: { label: 'CES', short: 'CES', place: 'voice', value: (r) => pct(r.details.voice.ces_percentage) },
  aiPulseReason: { label: 'AI pulse reason', short: 'Why', place: 'voice', value: (r) => text(r.details.voice.ai_pulse_reason) },

  revenactId: { label: 'Revenact ID', short: 'ID', place: 'profile', value: (r) => String(r.details.profile.revenact_id) },
  domain: { label: 'Domain', short: 'Domain', place: 'profile', value: (r) => text(r.details.profile.domain) },
  nameAddress: { label: 'Address', short: 'Address', place: 'profile', value: (r) => text(r.details.profile.address) },
  topSourceChannel: { label: 'Top source channel', short: 'Source', place: 'profile', value: (r) => text(r.details.profile.top_source_channel) },

  createdBy: { label: 'Created', short: 'Created', place: 'history', value: (r) => stamp(r.details.history.created_by?.name ?? null, r.details.history.created_at) },
  modifiedBy: { label: 'Modified', short: 'Modified', place: 'history', value: (r) => stamp(r.details.history.modified_by?.name ?? null, r.details.history.updated_at) },
  churnDate: { label: 'Churn date', short: 'Churned', place: 'history', value: (r) => day(r.details.history.churn_date) },
  churnReason: { label: 'Churn reason', short: 'Churn reason', place: 'history', value: (r) => text(r.details.history.churn_reason_label) },
  churnComment: { label: 'Churn comment', short: 'Churn note', place: 'history', value: (r) => text(r.details.history.churn_comment) },
};

export const PORTFOLIO_FIELDS = Object.fromEntries(
  Object.entries(defs).map(([id, def]) => [id, { id: id as ColumnId, ...def }]),
) as Record<ColumnId, FieldDef>;

export const HEADER_FIELDS: ColumnId[] = Object.values(PORTFOLIO_FIELDS)
  .filter((f) => f.place === 'header')
  .map((f) => f.id);

/** Panel order, so the pin menu reads like the opened row. */
export const PINNABLE_FIELDS: FieldDef[] = Object.values(PANEL_ORDER)
  .flat()
  .map((id) => PORTFOLIO_FIELDS[id]);

const SORT_LABELS: Record<(typeof BASE_SORT_KEYS)[number] | (typeof NUMERIC_SORT_KEYS)[number], string> = {
  arr: 'ARR',
  health: 'Health score',
  renewal: 'Renewal date',
  touch: 'Last touch',
  risk: 'Risk',
  name: 'Name',
  arr_billed_at_hq: 'ARR billed at HQ',
  total_contract_value: 'Total contract value',
  total_forecasted_renewal_revenue: 'Forecasted renewal revenue',
  implementation_fee: 'Implementation fee',
  total_contracted_seats: 'Contracted seats',
  total_active_seats: 'Active seats',
  seat_utilization_percentage: 'Seat utilisation',
  total_hires: 'Total hires',
  nps_score: 'NPS',
  csat_score: 'CSAT',
  ces_percentage: 'CES',
  ai_pulse_value: 'AI pulse',
  csm_pulse_score: 'CSM pulse',
};

export const SORT_OPTIONS: { value: string; label: string }[] = [...BASE_SORT_KEYS, ...NUMERIC_SORT_KEYS].map(
  (key) => ({ value: key, label: SORT_LABELS[key] }),
);

import type { CurrencyCode } from '../auth/authSlice';
import { LIFECYCLE_LABELS, formatDate, formatMoney } from '../customers/formatters';
import { pulseWords, signed } from '../organizations/portfolioFields';
import type { GroupOption } from '../organizations/portfolioGroups';
import type { PortfolioNoun } from '../organizations/portfolioLabels';
import { LIFECYCLE_VALUES } from '../organizations/portfolioParams';
import type { Option } from '../organizations/portfolioTypes';
import type { AccountPortfolioRow } from './portfolioTypes';

// Every Account field, with the one place the portfolio shows it (spec
// 2026-09-29 §1 "Opened row"). The ids are the backend's own
// (services/accounts_portfolio/fields.py), so the CSV and this registry name
// the same 24; the coverage test renders an opened row and finds each once.

export const ACCOUNT_NOUN: PortfolioNoun = { one: 'account', many: 'accounts' };

export type AccountPanelKey = 'commercial' | 'voice' | 'profile' | 'history';

export type AccountFieldId =
  | 'account'
  | 'owner'
  | 'lifecycleStage'
  | 'health'
  | 'pulse'
  | 'aiPulseScore'
  | 'aiPulseValue'
  | 'csmPulseScore'
  | 'arr'
  | 'renewalDate'
  | 'nps'
  | 'csatScore'
  | 'aiPulseReason'
  | 'revenactId'
  | 'organizations'
  | 'domain'
  | 'industry'
  | 'email'
  | 'phone'
  | 'address'
  | 'createdDate'
  | 'modifiedDate'
  | 'pulseRecordedOn'
  | 'csmPulseModifiedAt';

export const ACCOUNT_PANELS: { key: AccountPanelKey; title: string }[] = [
  { key: 'commercial', title: 'Commercial' },
  { key: 'voice', title: 'Voice of the customer' },
  { key: 'profile', title: 'Profile' },
  { key: 'history', title: 'History' },
];

export const ACCOUNT_PANEL_ORDER: Record<AccountPanelKey, AccountFieldId[]> = {
  commercial: ['arr', 'renewalDate'],
  voice: ['nps', 'csatScore', 'aiPulseReason'],
  profile: ['revenactId', 'organizations', 'domain', 'industry', 'email', 'phone', 'address'],
  history: ['createdDate', 'modifiedDate', 'pulseRecordedOn', 'csmPulseModifiedAt'],
};

export interface AccountFieldDef {
  id: AccountFieldId;
  label: string;
  place: 'header' | AccountPanelKey;
  value: (row: AccountPortfolioRow, currency: CurrencyCode) => string;
}

const DASH = '—';
const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : DASH);
const text = (s: string) => s.trim() || DASH;
const whole = (n: number | null) => (n == null ? DASH : String(n));
const pct = (n: number | null) => (n == null ? DASH : `${n}%`);

type Def = Omit<AccountFieldDef, 'id'>;
const defs: Record<AccountFieldId, Def> = {
  account: { label: 'Account', place: 'header', value: (r) => r.name },
  owner: { label: 'Owner', place: 'header', value: (r) => r.owner?.name ?? 'Unassigned' },
  lifecycleStage: { label: 'Lifecycle stage', place: 'header', value: (r) => r.lifecycle.label },
  health: { label: 'Health', place: 'header', value: (r) => r.health.score.toFixed(1) },
  pulse: { label: 'Pulse', place: 'header', value: (r) => pulseWords(r.pulse.history) },
  aiPulseScore: { label: 'AI pulse score', place: 'header', value: (r) => text(r.pulse.ai_label) },
  aiPulseValue: { label: 'AI pulse', place: 'header', value: (r) => whole(r.pulse.ai) },
  csmPulseScore: { label: 'CSM pulse', place: 'header', value: (r) => whole(r.pulse.csm) },

  arr: {
    label: 'ARR',
    place: 'commercial',
    value: (r, currency) => (r.details.commercial.arr == null ? DASH : formatMoney(r.details.commercial.arr, currency)),
  },
  renewalDate: { label: 'Renewal', place: 'commercial', value: (r) => day(r.details.commercial.renewal_date) },

  nps: { label: 'NPS', place: 'voice', value: (r) => signed(r.details.voice.nps_score) },
  csatScore: { label: 'CSAT', place: 'voice', value: (r) => pct(r.details.voice.csat_score) },
  aiPulseReason: { label: 'AI pulse reason', place: 'voice', value: (r) => text(r.details.voice.ai_pulse_reason) },

  revenactId: { label: 'Revenact ID', place: 'profile', value: (r) => String(r.details.profile.revenact_id) },
  organizations: {
    label: 'Organizations',
    place: 'profile',
    value: (r) => r.details.profile.organisations.map((org) => org.name).join(', ') || DASH,
  },
  domain: { label: 'Domain', place: 'profile', value: (r) => text(r.details.profile.domain) },
  industry: { label: 'Industry', place: 'profile', value: (r) => text(r.details.profile.industry) },
  email: { label: 'Email', place: 'profile', value: (r) => text(r.details.profile.email) },
  phone: { label: 'Phone', place: 'profile', value: (r) => text(r.details.profile.phone) },
  address: { label: 'Address', place: 'profile', value: (r) => text(r.details.profile.address) },

  createdDate: { label: 'Created', place: 'history', value: (r) => day(r.details.history.created_at) },
  modifiedDate: { label: 'Updated', place: 'history', value: (r) => day(r.details.history.updated_at) },
  pulseRecordedOn: { label: 'Pulse recorded on', place: 'history', value: (r) => day(r.details.history.pulse_recorded_on) },
  csmPulseModifiedAt: { label: 'CSM pulse set', place: 'history', value: (r) => day(r.details.history.csm_pulse_modified_at) },
};

export const ACCOUNT_FIELDS = Object.fromEntries(
  Object.entries(defs).map(([id, def]) => [id, { id: id as AccountFieldId, ...def }]),
) as Record<AccountFieldId, AccountFieldDef>;

export const ACCOUNT_HEADER_FIELDS: AccountFieldId[] = Object.values(ACCOUNT_FIELDS)
  .filter((field) => field.place === 'header')
  .map((field) => field.id);

/** The backend's five sorts (risk, ARR, renewal, health, name). */
export const ACCOUNT_SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'risk', label: 'Risk' },
  { value: 'arr', label: 'ARR' },
  { value: 'renewal', label: 'Renewal date' },
  { value: 'health', label: 'Health score' },
  { value: 'name', label: 'Name' },
];

export const ACCOUNT_GROUP_OPTIONS: GroupOption[] = [
  { value: 'none', label: 'None' },
  { value: 'health', label: 'Health' },
  { value: 'owner', label: 'Owner' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'renewal', label: 'Renewal window' },
];

/** The Board always has columns, so it offers no "None". */
export const ACCOUNT_BOARD_GROUP_OPTIONS: GroupOption[] = ACCOUNT_GROUP_OPTIONS.filter((option) => option.value !== 'none');

/** Every stage, Churn included: an account has no churn flow of its own,
 *  so Churn is only a stage (the backend's bulk edit accepts it). */
export const ACCOUNT_LIFECYCLE_TARGETS: Option[] = LIFECYCLE_VALUES.map((value) => ({ value, name: LIFECYCLE_LABELS[value] }));

/** "Pizza Hut", "Pizza Hut +1", or null when the viewer may open none of
 *  the account's organisations. */
export function organisationText(row: Pick<AccountPortfolioRow, 'organisation' | 'extra_organisations'>): string | null {
  if (!row.organisation) return null;
  return row.extra_organisations > 0 ? `${row.organisation.name} +${row.extra_organisations}` : row.organisation.name;
}

// Shared display-formatting helpers for adapting real backend records
// (Customer, Account) into the mock-data-era row shapes the table/card
// components already render — see mapToOrgRow.ts and mapToAccountRow.ts.
// Split out here because both mappers need the exact same date/health/
// lifecycle/AI-pulse/NPS/CSAT formatting rules (an Account's health and
// lifecycle mean the same thing as a Customer's, just at a finer grain —
// see the backend's Account model docstring).

import { formatDistanceToNowStrict } from 'date-fns';
import type { Customer } from './customersSlice';
import type { LifecycleCategory } from '../../components/organizations/tableData';
import type { CurrencyCode } from '../auth/authSlice';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Single source of truth for "every currency this app supports" — used by
// both Settings > Currency's own picker and OrganizationFormModal's Add/Edit
// Organization currency field (Tier 1's per-Customer contract currency).
// `symbol` is cosmetic (just for the dropdown option text, e.g. "USD — US
// Dollar ($)") — actual money formatting always goes through
// formatMoney/formatCompactMoney below, which get the real symbol/decimal
// rules from Intl.NumberFormat, not this list.
export const CURRENCY_OPTIONS: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
];

// Formats a "YYYY-MM-DD" date-only string without going through `Date`
// (which would apply the local timezone and can shift the day).
export function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// The US order, "Sep 12, 2026", used by the activity tabs' day headings.
export function formatDateUS(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// Full precision, e.g. "$1,234.56" / "¥12,345" (JPY's minor unit is 0 —
// Intl handles that automatically, so this doesn't need a currency-specific
// special case). Currency-aware replacement for the old formatMoney(val),
// which returned a bare "1,234.56" and left every caller to prepend "$" by
// hand — some (Organizations table) didn't, which was its own bug.
export function formatMoney(val: string | number | null | undefined, currency: CurrencyCode): string {
  const n = Number(val ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
}

// Compact/tiered, e.g. "$1.8M" / "$450.0K" — for stat cards, Kanban cards,
// and other tight spaces that can't fit full precision. Single source of
// truth for K/M tiering, replacing what used to be 8 independently
// hand-rolled (and already-drifted — some did .toFixed(0) on the K-tier,
// others .toFixed(1)) copies of this exact logic.
export function formatCompactMoney(val: string | number | null | undefined, currency: CurrencyCode): string {
  const n = Number(val ?? 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPercent(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return `${parseFloat(String(val))}%`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return letters.toUpperCase() || '?';
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A Contact/Opportunity/Risk/Account's own `companies`/`customers` is
// every ultimate parent Customer (see those types' own docstrings) —
// almost always exactly one, but an account-level one's own Account
// can now belong to more than one Customer at once (see the backend
// Account model's own docstring). Renders "Acme Inc" for one, "Acme
// Inc +1" for more, rather than silently dropping the others.
export function companyLabel(companies: { id: number; name: string }[]): string {
  if (companies.length === 0) return '—';
  const [first, ...rest] = companies;
  return rest.length > 0 ? `${first.name} +${rest.length}` : first.name;
}

// Contact.last_contacted_at is a real datetime (not the old mock's
// frozen "2 hours ago" string) — this is what keeps the Contacts
// tables' own display accurate as time passes instead of drifting
// stale the way a stored string would.
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export const HEALTH_COLORS: Record<Customer['health_category'], string> = {
  good: 'bg-[var(--success)]',
  average: 'bg-[var(--warning)]',
  poor: 'bg-[var(--danger)]',
};

export const LIFECYCLE_LABELS: Record<LifecycleCategory, string> = {
  onboarding: 'Onboarding',
  kickoff: 'Kickoff',
  adoption: 'Adoption',
  live: 'Live',
  renewal: 'Renewal',
  churn: 'Churn',
  expansion: 'Expansion',
  other: 'Other',
};

export const AI_PULSE_LABELS: Record<Customer['ai_pulse_score'], string> = {
  very_satisfied: 'Very Satisfied',
  satisfied: 'Satisfied',
  moderate: 'Moderate',
  high_risk: 'High Risk',
  '': '—',
};

// Matches the mock data's own implied rule: any positive score reads as
// healthy, zero is neutral, negative is a detractor signal.
export function npsColor(nps: number): string {
  if (nps > 0) return 'bg-[var(--success)]';
  if (nps === 0) return 'bg-[var(--warning)]';
  return 'bg-[var(--danger)]';
}

// Thresholds fitted to the mock data's own csat/ces color bands.
export function csatColor(pct: number): string {
  if (pct >= 70) return 'bg-[var(--success)]';
  if (pct >= 50) return 'bg-[var(--warning)]';
  return 'bg-[var(--danger)]';
}

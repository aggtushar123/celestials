import type { Account } from './customersSlice';
import type { AccountRow } from '../../components/organizations/accountsData';
import { formatDate, initials, HEALTH_COLORS, LIFECYCLE_LABELS, AI_PULSE_LABELS } from './formatters';

// Adapts a real backend `Account` into the `AccountRow` shape the
// (mock-data-era) Accounts tab (Details.tsx's AccountsTab/
// AccountsMetricsBanner) already renders — same approach as
// mapToOrgRow.ts for Customer/OrgRow, and for the same reason: swapping
// mock data for real data didn't require rewriting that UI.
//
// `orgId`/`orgName`/`orgDomain`/`orgAddress`/`orgEmail`/`orgPhone`/
// `orgIndustry` come from a parent Customer (already fetched by
// Details.tsx for its own header/General tab) rather than from the
// Account itself — the *first* one, when there's more than one (see
// `orgs` below and the backend Account model's own docstring on why an
// Account can now be linked to several) — and its own
// `domain`/`address`/`email`/`phone`/`industry` are meant to fall back
// to that first parent's when blank (see the backend Account model's
// docstring) — this is what feeds ActivityFeed's Overview tab for a
// standalone Account page. `orgIndustry` defaults to `''` — most call
// sites (the standalone Accounts page/board) have no already-fetched
// parent Customer to source it from, same as they already do for
// domain/address/email/phone. `orgs` is
// every linked Customer (straight off the real Account, not an arg —
// unlike orgId/orgName it doesn't need a parent already fetched) —
// powers the standalone Account page's own Organizations tab, which
// lists all of them rather than assuming there's only one.
export function mapAccountToAccountRow(
  a: Account,
  orgId: number,
  orgName: string,
  orgDomain: string,
  orgAddress: string,
  orgEmail: string,
  orgPhone: string,
  orgIndustry: string = ''
): AccountRow {
  const arr = Number(a.arr);
  const nps = a.nps_score ?? 0;
  const csat = a.csat_score !== null ? parseFloat(a.csat_score) : null;
  const domain = a.domain || orgDomain;

  return {
    orgId,
    id: String(a.id),
    name: a.name,
    orgName,
    orgs: a.customers,
    logo: domain ? `https://logo.clearbit.com/${domain}` : '',
    revenactId: a.id,
    domain: domain || undefined,
    location: a.address || orgAddress || undefined,
    email: a.email || orgEmail || undefined,
    phone: a.phone || orgPhone || undefined,
    industry: a.industry || orgIndustry || undefined,
    pulse: a.pulse,
    aiPulseScore: AI_PULSE_LABELS[a.ai_pulse_score] ?? '—',
    aiPulseReason: a.ai_pulse_reason || '-',
    owner: a.owner?.name ?? 'Unassigned',
    ownerId: a.owner?.id ?? null,
    ownerFunction: a.owner?.function ?? null,
    accountPulse: a.account_pulse ?? null,
    avatar: a.owner ? initials(a.owner.name) : '—',
    health: { val: Number(a.health_score), clr: HEALTH_COLORS[a.health_category] },
    healthCategory: a.health_category,
    nps: a.nps_score === null ? '0' : `${nps > 0 ? '+' : ''}${nps}`,
    npsValue: nps,
    csat: csat === null ? 'N/A' : `${csat}%`,
    csatValue: csat ?? 0,
    lifecycleStage: LIFECYCLE_LABELS[a.lifecycle_stage] ?? 'Other',
    mrr: Math.round(arr / 12),
    arr,
    renewal: formatDate(a.renewal_date),
  };
}

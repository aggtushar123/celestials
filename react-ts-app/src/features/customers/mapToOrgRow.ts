import type { Customer } from './customersSlice';
import type { OrgRow } from '../../components/organizations/tableData';
import {
  formatDate,
  formatMoney,
  formatPercent,
  initials,
  HEALTH_COLORS,
  LIFECYCLE_LABELS,
  AI_PULSE_LABELS,
  npsColor,
  csatColor,
} from './formatters';

// Adapts a real backend `Customer` into the `OrgRow` shape the Board,
// Details, Lifecycle and Health pages (and the org popovers) render. The
// Organizations list no longer uses it: it reads `/organizations/portfolio/`,
// whose rows are already shaped server-side.
//
// A few OrgRow fields have no backend counterpart (they were always purely
// presentational: pill/dot colors, avatar initials, the "(Enterprise)"/
// "(Mid-Market)" tier suffix on lifecycle stage) — those are derived here
// from real fields rather than fabricated from nothing.

// currency (Tier 1) now lives on the Customer itself — arrAccount/arrHQ/
// etc. below are formatted in *this customer's own* currency, not the
// org's reporting one (see Customer.currency's own docstring). A single
// mixed-currency table is the intended result: each row is internally
// consistent, labeled by its own currency symbol.
export function mapCustomerToOrgRow(c: Customer): OrgRow {
  const arr = Number(c.arr_billed_at_account);
  const nps = c.nps_score ?? 0;
  const csat = c.csat_score !== null ? parseFloat(c.csat_score) : null;

  return {
    org: c.name,
    logo: c.domain ? `https://logo.clearbit.com/${c.domain}` : '',
    id: c.id,
    owner: c.owner?.name ?? 'Unassigned',
    accountPulse: c.account_pulse ?? null,
    avatar: c.owner ? initials(c.owner.name) : '—',
    bg: c.owner ? 'bg-info' : 'bg-line-strong',
    img: c.owner?.avatar,
    stage: LIFECYCLE_LABELS[c.lifecycle_stage] ?? 'Other',
    health: { val: Number(c.health_score), clr: HEALTH_COLORS[c.health_category] },
    healthCategory: c.health_category,
    healthBreakdown: c.health_breakdown,
    healthIsOverridden: c.health_score_is_overridden,
    csatBreakdown: c.csat_breakdown,
    lifecycleCategory: c.lifecycle_stage,
    pulse: c.pulse,
    aiScore: AI_PULSE_LABELS[c.ai_pulse_score] ?? '—',
    reason: c.ai_pulse_reason || '-',
    fullReason: c.ai_pulse_reason || '-',
    nps: c.nps_score === null ? '0' : `${nps > 0 ? '+' : ''}${nps}`,
    npsValue: nps,
    npsColor: npsColor(nps),
    csat: csat === null ? 'N/A' : `${csat}%`,
    csatColor: csat === null ? 'bg-line-strong' : csatColor(csat),
    joined: formatDate(c.joined_date),
    renewal: formatDate(c.renewal_date),
    arrAccount: formatMoney(c.arr_billed_at_account, c.currency),
    arrHQ: formatMoney(c.arr_billed_at_hq, c.currency),
    implFee: formatMoney(c.implementation_fee, c.currency),
    tcv: formatMoney(c.total_contract_value, c.currency),
    tcvRenewal: formatMoney(c.total_forecasted_renewal_revenue, c.currency),
    contractStart: formatDate(c.contract_start_date),
    contractEnd: formatDate(c.contract_end_date),
    productsUtilized: {
      // The name, not the id: this row is what the table prints.
      primary: c.primary_product_name || '-',
      additional: c.additional_products_count,
    },
    topSourceChannel: c.top_source_channel || '-',
    totalContractedSeats: c.total_contracted_seats ?? 0,
    totalActiveSeats: c.total_active_seats ?? 0,
    totalSeatUtilization: formatPercent(c.seat_utilization_percentage),
    totalHires: c.total_hires ?? 0,
    scopeWebApp: c.scope_web_app || 'N/A',
    cesPercentage: formatPercent(c.ces_percentage),
    churnDate: formatDate(c.churn_date),
    // The label from the API, not our own lookup — the taxonomy has one home
    // (see ChurnReason in customersSlice).
    churnReason: c.churn_reason_display || '-',
    churnComment: c.churn_comment || '-',
    domain: c.domain || '-',
    createdBy: c.created_by?.name ?? 'System',
    modifiedBy: c.modified_by?.name ?? 'System',
    nameAddress: c.address || '-',
    email: c.email || undefined,
    phone: c.phone || undefined,
    industry: c.industry || undefined,
    mrr: Math.round(arr / 12),
    arr,
    currency: c.currency,
  };
}

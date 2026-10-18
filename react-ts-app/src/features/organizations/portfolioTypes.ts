import type { CurrencyCode } from '../auth/authSlice';

// Mirrors revenact-backend's GET /api/v1/organizations/portfolio/ — see
// docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md §2 and
// revenact-backend/docs/API_CONTRACTS.md -> organizations.
// The `details` group keys are the Customer field names (plan pre-flight #3).

export type HealthBand = 'good' | 'average' | 'poor';
export type LifecycleValue =
  | 'onboarding' | 'kickoff' | 'adoption' | 'live' | 'renewal' | 'churn' | 'expansion' | 'other';
export type NpsBand = 'promoter' | 'passive' | 'detractor';
export type GroupKey = 'health' | 'owner' | 'lifecycle' | 'product' | 'renewal';
export type SignalKind = 'renewal_overdue' | 'risk' | 'tickets';
export type RiskDirection = 'declining' | 'improving' | 'flat' | 'unknown';

/** A filter choice, shaped like every dashboard response's options. */
export interface Option {
  value: string;
  name: string;
}

/** The header fields every portfolio row carries, organisation or account:
 *  what the kind-agnostic row, card, sheet and board read. */
export interface PortfolioRowBase {
  id: number;
  name: string;
  initials: string;
  owner: { id: number; name: string } | null;
  lifecycle: { value: LifecycleValue; label: string };
  health: { score: number; category: HealthBand; trend: number[] };
  renewal: { date: string | null; days: number | null };
  arr: number | null;
  risk: { score: number; direction: RiskDirection };
  pulse: {
    csm: number | null;
    ai: number | null;
    /** An account with no AI pulse carries null here; an organisation ''. */
    ai_category: string | null;
    ai_label: string;
    reason: string;
    history: number[];
    disagree: boolean;
  };
  last_touch_days: number | null;
  urgent_tickets: number;
  signal: { kind: SignalKind; label: string } | null;
}

/** A portfolio's filter choices. Organizations list products, Accounts
 *  organisations; both list owners and stages. */
export interface FilterOptions {
  owners: Option[];
  lifecycles: Option[];
  products?: Option[];
  organisations?: Option[];
}

export interface OrganizationFilters {
  owners: Option[];
  lifecycles: Option[];
  products: Option[];
}

export interface PortfolioDetails {
  commercial: {
    /** The account's own contract currency: these five figures are in it,
     *  exactly as the old table printed them. */
    currency: CurrencyCode;
    arr_billed_at_account: number | null;
    arr_billed_at_hq: number | null;
    total_contract_value: number | null;
    total_forecasted_renewal_revenue: number | null;
    implementation_fee: number | null;
  };
  contract: {
    joined_date: string | null;
    contract_start_date: string | null;
    renewal_date: string | null;
    contract_end_date: string | null;
  };
  adoption: {
    total_contracted_seats: number | null;
    total_active_seats: number | null;
    seat_utilization_percentage: number | null;
    total_hires: number | null;
    /** The single primary product (the product filter and group read it)
     *  and how many others, which nobody names. */
    products: { primary: { id: number; name: string } | null; additional_count: number | null };
    scope_web_app: string;
  };
  voice: {
    nps_score: number | null;
    csat_score: number | null;
    ces_percentage: number | null;
    ai_pulse_reason: string;
  };
  profile: {
    revenact_id: number;
    domain: string;
    address: string;
    top_source_channel: string;
  };
  history: {
    created_by: { id: number; name: string } | null;
    created_at: string;
    modified_by: { id: number; name: string } | null;
    updated_at: string;
    churn_date: string | null;
    /** The stored value; `churn_reason_label` is what to print. */
    churn_reason: string;
    churn_reason_label: string;
    churn_comment: string;
  };
}

export interface PortfolioRow {
  id: number;
  name: string;
  initials: string;
  owner: { id: number; name: string } | null;
  lifecycle: { value: LifecycleValue; label: string };
  // Backend: Customer.health_score is a non-nullable column (default 5.0),
  // and rows.row_payload always does float(customer.health_score) — never
  // null (backend rows.py / API_CONTRACTS.md organizations example).
  health: { score: number; category: HealthBand; trend: number[] };
  renewal: { date: string | null; days: number | null };
  /** Converted into the response's `currency`, as the dashboard figures are;
   *  null when the contract currency has no exchange rate. */
  arr: number | null;
  /** The Triage score, equal to /customers/health/'s triage_score. */
  risk: { score: number; direction: RiskDirection };
  pulse: {
    csm: number | null;
    ai: number | null;
    ai_category: string;
    /** The old "AI Pulse Score" column. */
    ai_label: string;
    reason: string;
    /** The stored pulse dots: the old "Pulse" column (1 good, 2 poor, 3 mixed, 0 no signal). */
    history: number[];
    /** |csm − ai| ≥ 2, computed by the server. */
    disagree: boolean;
  };
  /** Null when the account has never been contacted. */
  last_touch_days: number | null;
  urgent_tickets: number;
  /** At most one; always null for a churned row. */
  signal: { kind: SignalKind; label: string } | null;
  is_archived: boolean;
  /** A churn_date is set or the stage is Churn. */
  churned: boolean;
  details: PortfolioDetails;
}

export interface PortfolioGroup {
  key: string;
  label: string;
  count: number;
  arr: number;
}

export interface BandFigures {
  good: number;
  average: number;
  poor: number;
}

export interface PortfolioSummary {
  health: BandFigures & { arr: BandFigures; mrr: BandFigures };
  // Backend: shape.build_summary always returns a rounded percentage, or 0
  // when nobody has been scored — never null (rows.py / API_CONTRACTS.md).
  nps: { score: number; promoters: number; passives: number; detractors: number };
  lifecycle: { value: LifecycleValue; label: string; count: number; arr: number }[];
  accounts: number;
  arr: number;
  /** Accounts left out of the money totals for want of an exchange rate. */
  unconverted_count: number;
  renewing: { '30': number; '90': number };
}

/** One read of a portfolio endpoint (`/organizations/portfolio/` or
 *  `/accounts/portfolio/`): one envelope, each kind's own rows and filters. */
export interface PortfolioPage<R extends PortfolioRowBase = PortfolioRowBase, F extends FilterOptions = FilterOptions> {
  results: R[];
  next_cursor: string | null;
  count: number;
  groups: PortfolioGroup[];
  summary: PortfolioSummary;
  filters: F;
  currency: CurrencyCode;
}

export type PortfolioResponse = PortfolioPage<PortfolioRow, OrganizationFilters>;

export type BulkAction = 'set_owner' | 'set_lifecycle' | 'archive';

export interface BulkRequest {
  ids: number[];
  action: BulkAction;
  /** A user id (or null to unassign) for set_owner, a stage other than
   *  churn for set_lifecycle, null for archive. */
  value: number | string | null;
}

export interface BulkResult {
  updated: number[];
  failed: { id: number; reason: string }[];
}

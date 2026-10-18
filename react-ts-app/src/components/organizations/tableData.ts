import type { AccountPulse } from '../../features/customers/customersSlice';
import type { CsatBreakdown, HealthComponent } from '../../features/customers/customersSlice';
import type { CurrencyCode } from '../../features/auth/authSlice';

export type ColumnId =
  | 'organization' | 'revenactId' | 'owner' | 'lifecycleStage' | 'health' | 'pulse'
  | 'aiPulseScore' | 'aiPulseReason' | 'nps' | 'csatScore' | 'joinedDate' | 'renewalDate'
  | 'arrAccount' | 'arrHQ' | 'implFee' | 'tcv' | 'tcvRenewal' | 'contractStart' | 'contractEnd'
  | 'productsUtilized' | 'topSourceChannel' | 'totalContractedSeats' | 'totalActiveSeats'
  | 'totalSeatUtilization' | 'totalHires' | 'scopeWebApp' | 'cesPercentage' | 'churnDate'
  | 'churnReason' | 'churnComment' | 'domain' | 'createdBy' | 'modifiedBy' | 'nameAddress';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  isCompulsory?: boolean;
  isCalc?: boolean;
}

export type HealthCategory = 'good' | 'average' | 'poor';
export type LifecycleCategory = 'onboarding' | 'kickoff' | 'adoption' | 'live' | 'renewal' | 'churn' | 'expansion' | 'other';

export interface OrgRow {
  org: string;
  logo: string;
  id: number;
  owner: string;
  avatar: string;
  bg: string;
  img?: string;
  stage: string;
  health: { val: number; clr: string };
  healthCategory: HealthCategory;
  /** The components behind `health.val`, for the health column's popover.
   *  Optional because the mock ORGANIZATIONS_DATA below predates the rubric
   *  and is only a no-nav-state fallback, never real data. */
  healthBreakdown?: HealthComponent[];
  healthIsOverridden?: boolean;
  /** The CSAT distribution behind `csat`, for that column's popover.
   *  Optional for the same reason as healthBreakdown — the mock fallback
   *  rows below predate it. */
  csatBreakdown?: CsatBreakdown;
  lifecycleCategory: LifecycleCategory;
  pulse: number[];
  /** The computed pulse from the API; absent on mock rows. */
  accountPulse?: AccountPulse | null;
  aiScore: string;
  reason: string;
  fullReason: string;
  nps: string;
  npsValue: number;
  npsColor: string;
  csat: string;
  csatColor: string;
  joined: string;
  renewal: string;
  arrAccount: string;
  arrHQ: string;
  implFee: string;
  tcv: string;
  tcvRenewal: string;
  contractStart: string;
  contractEnd: string;
  productsUtilized: { primary: string; additional: number | null };
  topSourceChannel: string;
  totalContractedSeats: number;
  totalActiveSeats: number;
  totalSeatUtilization: string;
  totalHires: number;
  scopeWebApp: string;
  cesPercentage: string;
  churnDate: string;
  churnReason: string;
  churnComment: string;
  domain: string;
  createdBy: string;
  modifiedBy: string;
  nameAddress: string;
  /** Shown on ActivityFeed's Overview tab — optional since the mock
   * TABLE_DATA below (unused by any real page, kept only as historical
   * fallback data) predates these fields. */
  email?: string;
  phone?: string;
  /** Shown on ActivityFeed's Overview tab — optional for the same
   * "mock TABLE_DATA below predates this field" reason as email/phone
   * above. */
  industry?: string;
  mrr: number;
  arr: number;
  /** This row's own contract currency (Customer.currency, Tier 1) — `arr`/
   * `mrr` above are raw numbers in *this* currency, not the org's
   * reporting one. Compact/card displays elsewhere (e.g. the Organizations
   * board's own Kanban cards) format `arr` with this, not useOrgCurrency().
   * Optional for the same reason `email`/`phone` above are: the mock
   * TABLE_DATA below (unused by any real page) predates this field. */
  currency?: CurrencyCode;
}

export const ALL_COLUMNS: ColumnDef[] = [
  { id: 'organization', label: 'Organization', isCompulsory: true },
  { id: 'revenactId', label: 'Revenact ID' },
  { id: 'owner', label: 'Owner' },
  { id: 'lifecycleStage', label: 'Lifecycle Stage' },
  { id: 'health', label: 'Health' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'aiPulseScore', label: 'AI Pulse Score' },
  { id: 'aiPulseReason', label: 'AI Pulse Reason' },
  { id: 'nps', label: 'NPS' },
  { id: 'csatScore', label: 'CSAT Score' },
  { id: 'joinedDate', label: 'Joined Date' },
  { id: 'renewalDate', label: 'Renewal Date' },
  { id: 'arrAccount', label: 'Total ARR Billed At Account ($)', isCalc: true },
  { id: 'arrHQ', label: 'Total ARR Billed At HQ ($)', isCalc: true },
  { id: 'implFee', label: 'Implementation Fee (One Time) ($)' },
  { id: 'tcv', label: 'Total Contract Value ($)', isCalc: true },
  { id: 'tcvRenewal', label: 'Total Forecasted Renewal Revenue ($)', isCalc: true },
  { id: 'contractStart', label: 'Contract Start Date' },
  { id: 'contractEnd', label: 'Contract End Date' },
  { id: 'productsUtilized', label: 'Products Utilized' },
  { id: 'topSourceChannel', label: 'Top Source Channel' },
  { id: 'totalContractedSeats', label: 'Total Contracted Seats', isCalc: true },
  { id: 'totalActiveSeats', label: 'Total Active Seats', isCalc: true },
  { id: 'totalSeatUtilization', label: 'Total Seat Usage Utilization %', isCalc: true },
  { id: 'totalHires', label: 'Total Hires', isCalc: true },
  { id: 'scopeWebApp', label: 'Scope WebApp' },
  { id: 'cesPercentage', label: 'CES Percentage' },
  { id: 'churnDate', label: 'Churn Date' },
  { id: 'churnReason', label: 'Churn Reason' },
  { id: 'churnComment', label: 'Churn Comment' },
  { id: 'domain', label: 'Domain' },
  { id: 'createdBy', label: 'Created By / Created Date' },
  { id: 'modifiedBy', label: 'Modified By / Modified Date' },
  { id: 'nameAddress', label: 'Name / Address' },
];

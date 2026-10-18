// Mirrors revenact-backend's TaskListSerializer/CockpitSummaryView
// field-for-field — see docs/API_CONTRACTS.md -> customers -> Task /
// Cockpit summary.

export interface CockpitHealthBreakdown {
  good: number;
  average: number;
  poor: number;
}

export interface CockpitBookSummary {
  count: number;
  value: number;
  health: CockpitHealthBreakdown;
  unconverted_count?: number;
}

export interface CockpitRenewalBucket {
  count: number;
  value: number;
}

export interface CockpitRenewalItem {
  id: number;
  name: string;
  type: 'customer' | 'account';
  value: number;
  renewal_date: string;
}

export interface CockpitRenewals {
  window_days: number;
  customers: CockpitRenewalBucket;
  accounts: CockpitRenewalBucket;
  // Every renewing Customer/Account merged into one list, sorted
  // soonest-first — the real drill-down, not just a count/value pair.
  items: CockpitRenewalItem[];
}

export interface CockpitSummary {
  customers: CockpitBookSummary;
  accounts: CockpitBookSummary;
  renewals: CockpitRenewals;
}

export const RENEWAL_WINDOW_OPTIONS = [30, 60, 90] as const;
export type RenewalWindowDays = (typeof RENEWAL_WINDOW_OPTIONS)[number];

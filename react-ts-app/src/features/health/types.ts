/**
 * The shape the Health Overview tabs read.
 *
 * Lived in `pages/dashboard/tabs/health-overview/mockData.ts` while the screen
 * ran on generated data. It's the domain type now — `toHealthDataRow` builds it
 * from `/api/v1/customers/health/`, and the mock is only a test fixture.
 */

export type HealthStatus = 'Poor' | 'Average' | 'Good';

export interface HealthHistoryEntry {
  /** Display label for the month, e.g. "Aug 31, 2026". */
  month: string;
  status: HealthStatus;
}

export interface HealthDataRow {
  id: string;
  account: string;
  /** The owning CSM's name, or a placeholder when unassigned. */
  owner: string;
  /**
   * The owning CSM's id as a string, or `'unassigned'`.
   *
   * What the Primary Owner filter keys on. Two CSMs called "John Smith" is an
   * ordinary thing in a real org, and filtering on the label would merge their
   * books without anyone noticing. `'unassigned'` is a real bucket, not a
   * missing value: "nobody owns this" is a finding, not an absence.
   */
  ownerKey: string;
  /** The stage as a person reads it, e.g. "Customer - Active". */
  lifecycleStage: string;
  /** The stage's stored value, e.g. "customer_active" — what the Lifecycle
   *  Stage filter keys on. Same split as `owner`/`ownerKey`: labels are
   *  renamed, and a filter keyed on a label breaks the day someone does. */
  lifecycleKey: string;
  /** "MMM d, yyyy" — the shape `triage.daysToRenewal` parses. Empty when the
   *  account has no renewal date recorded. */
  renewalDate: string;
  healthStatus: HealthStatus;
  healthScore: number;
  /**
   * 1-5, or **null when nobody has rated it**.
   *
   * Null is a real state, not a missing value to paper over: an account the CSM
   * hasn't scored is not one they scored badly, and the Divergence view must
   * not read it as agreement. Every consumer handles null explicitly.
   */
  csmPulseScore: number | null;
  /** 1-5, or null when the model hasn't scored it. Named `aiPulseScore` for
   *  continuity with the screen, but it carries the backend's numeric
   *  `ai_pulse_value`, not the `ai_pulse_score` category string. */
  aiPulseScore: number | null;
  /** When the CSM pulse last changed, or null if it never has. */
  lastPulseModified: string | null;
  aiPulseReason: string;
  /**
   * Annual recurring revenue, already converted into the organisation's own
   * reporting currency by the backend — **null when it couldn't be**.
   *
   * Null means that customer's contract currency has no exchange rate
   * configured, not that the contract is worth nothing. Every money total on
   * the Renewal tab leaves those rows out and says how many it left out;
   * treating an unconverted figure as if it were already in the reporting
   * currency is the one outcome worse than excluding it.
   */
  arr: number | null;
  /**
   * Days since the last logged activity — the same number the health score's
   * Customer Touch component is built from, not a second definition of
   * "touched". An account nobody has ever touched is measured from when it
   * arrived, so a logo onboarded last week doesn't read as neglected.
   */
  daysSinceTouch: number | null;
  /**
   * Seats in active use. The mock called this `activeRecruiters` and invented
   * it; the backend has `total_active_seats` and no recruiter count at all.
   */
  activeSeats: number | null;
  /**
   * Probability this renewal is lost, 0–1, from the backend's shared churn
   * rule (`services/customers/churn.py`).
   *
   * Served rather than computed here: the Revenue Forecast needs the same
   * number about the same account, and two implementations of a churn model
   * that both drive money on screen is a discrepancy with a date on it. It is
   * a stated business rule, not a fitted model — see that module.
   */
  riskOfLoss: number;
  /** Every contribution behind `riskOfLoss`, in the order it was applied. The
   *  Renewal tab prints them on the row: a ranking nobody can interrogate is a
   *  ranking nobody acts on. */
  riskFactors: { label: string; points: number }[];
  /** Oldest month first. Empty when nothing has been recorded. */
  history: HealthHistoryEntry[];
  /**
   * The Triage view's risk score, 0–155 — **not capped at 100**. Computed by
   * the backend (a Python port of `triage.ts`'s old scoring) rather than in
   * the browser, so the Renewal Forecast and this screen can never disagree
   * about the same account. Higher is worse.
   */
  triageScore: number;
  /** Every factor behind `triageScore`, highest points first. Empty when the
   *  account carries no risk at all — not a missing value. */
  triageFactors: { label: string; points: number }[];
  /** Which way the server reads this account's recent trajectory. */
  triageDirection: 'declining' | 'improving' | 'flat' | 'unknown';
}

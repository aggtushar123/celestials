import { format, parseISO } from 'date-fns';
import type { CurrencyCode } from '../auth/authSlice';
import type { HealthDataRow, HealthHistoryEntry, HealthStatus } from './types';

/** One row of `GET /api/v1/customers/health/`. */
export interface CustomerHealthApiRow {
  id: number;
  name: string;
  owner_id: number | null;
  owner_name: string | null;
  lifecycle_stage: string;
  lifecycle_stage_display: string;
  renewal_date: string | null;
  health_score: string;
  health_category: 'good' | 'average' | 'poor';
  csm_pulse_score: number | null;
  csm_pulse_modified_at: string | null;
  ai_pulse_value: number | null;
  ai_pulse_reason: string;
  /** In the organisation's reporting currency; null when unconvertible. */
  arr: number | null;
  days_since_touch: number | null;
  risk_of_loss: number;
  risk_factors: { label: string; points: number }[];
  total_active_seats: number | null;
  /** 0–155, not capped at 100. Optional so a fixture written before this
   *  field existed still parses — `toHealthDataRow` defaults it to 0. */
  triage_score?: number;
  /** Highest points first. Optional for the same reason as `triage_score`. */
  triage_factors?: { label: string; points: number }[];
  /** Optional for the same reason as `triage_score`; defaults to 'unknown'. */
  triage_direction?: 'declining' | 'improving' | 'flat' | 'unknown';
  history: {
    captured_on: string;
    health_score: string;
    health_category: 'good' | 'average' | 'poor';
    csm_pulse_score: number | null;
    ai_pulse_value: number | null;
  }[];
}

export interface CustomerHealthApiResponse {
  results: CustomerHealthApiRow[];
  count: number;
  history_months: number;
  /** True when the book was larger than the endpoint's cap and rows were cut. */
  truncated: boolean;
  /** The reporting currency every `arr` above is denominated in. */
  currency: CurrencyCode;
  /** Rows whose ARR couldn't be converted into it. The Renewal tab names this
   *  rather than quietly totalling a partial book. */
  unconverted_count: number;
}

const STATUS_BY_CATEGORY: Record<CustomerHealthApiRow['health_category'], HealthStatus> = {
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
};

/** The bucket every unowned account lands in. A real bucket rather than a
 *  missing value — "nobody owns this" is one of the more useful things the
 *  Primary Owner filter can show you. */
export const UNASSIGNED_KEY = 'unassigned';
export const UNASSIGNED_LABEL = 'Unassigned';

/** The date shape `triage.daysToRenewal` parses — see RENEWAL_DATE_FORMAT. */
const DISPLAY_DATE = 'MMM d, yyyy';

/** Backend dates are ISO; the screen reads them in its own display format. */
function toDisplayDate(iso: string | null): string {
  if (!iso) return '';
  const parsed = parseISO(iso);
  return Number.isNaN(parsed.getTime()) ? '' : format(parsed, DISPLAY_DATE);
}

function toHistory(rows: CustomerHealthApiRow['history']): HealthHistoryEntry[] {
  return rows.map((entry) => ({
    month: toDisplayDate(entry.captured_on),
    status: STATUS_BY_CATEGORY[entry.health_category],
  }));
}

/**
 * Map one API row onto the shape the four tabs read.
 *
 * Nothing is invented here. Where the backend has nothing — an unrated pulse,
 * a missing renewal date, no recorded seats — this passes the absence through
 * rather than substituting a neutral-looking number, because every one of
 * those substitutions would read as a real measurement downstream.
 */
export function toHealthDataRow(row: CustomerHealthApiRow): HealthDataRow {
  return {
    id: String(row.id),
    account: row.name,
    owner: row.owner_name ?? UNASSIGNED_LABEL,
    ownerKey: row.owner_id === null ? UNASSIGNED_KEY : String(row.owner_id),
    lifecycleStage: row.lifecycle_stage_display || row.lifecycle_stage,
    lifecycleKey: row.lifecycle_stage,
    renewalDate: toDisplayDate(row.renewal_date),
    healthStatus: STATUS_BY_CATEGORY[row.health_category],
    healthScore: Number(row.health_score),
    csmPulseScore: row.csm_pulse_score,
    aiPulseScore: row.ai_pulse_value,
    lastPulseModified: row.csm_pulse_modified_at
      ? toDisplayDate(row.csm_pulse_modified_at.slice(0, 10))
      : null,
    aiPulseReason: row.ai_pulse_reason,
    arr: row.arr,
    daysSinceTouch: row.days_since_touch,
    riskOfLoss: row.risk_of_loss,
    riskFactors: row.risk_factors ?? [],
    activeSeats: row.total_active_seats,
    history: toHistory(row.history),
    triageScore: row.triage_score ?? 0,
    triageFactors: row.triage_factors ?? [],
    triageDirection: row.triage_direction ?? 'unknown',
  };
}

export function toHealthDataRows(rows: CustomerHealthApiRow[]): HealthDataRow[] {
  return rows.map(toHealthDataRow);
}

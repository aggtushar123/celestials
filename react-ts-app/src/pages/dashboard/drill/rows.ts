import type { HealthDataRow } from '../../../features/health/types';
import type { UsageAccount } from '../../../features/usage/usageSlice';
import type { DrillRow } from './types';

/**
 * A `HealthDataRow` as the drill panel wants it.
 *
 * Every Health drill — Triage's tiles, Divergence's headline, Movement's
 * tiles and its renewal chart — filters the same book down to a subset and
 * hands it here, rather than each view building its own `DrillRow` object
 * literal: one place that knows the field mapping is one place to fix it.
 *
 * `detail` is a per-row callback rather than a fixed string because it means
 * something different at each call site (a risk score, a days-to-renewal
 * count, or nothing at all) — most drills pass none.
 */
export function fromHealthRows(
  rows: HealthDataRow[],
  detail?: (row: HealthDataRow) => string | undefined,
): DrillRow[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.account,
    owner: row.owner,
    arr: row.arr,
    detail: detail?.(row),
  }));
}

/**
 * A `UsageAccount` as the drill panel wants it — Usage Overview's counterpart
 * to `fromHealthRows`.
 *
 * Every drill on that tab (the seat-utilisation, shelfware and at-capacity
 * tiles, and the utilisation-band chart's cells) filters `stats.scatter` —
 * the complete list of every *measured* account the book-wide figures were
 * computed over — down to a subset and hands it here, rather than each call
 * site building its own `DrillRow` literal.
 */
export function fromUsageRows(
  rows: UsageAccount[],
  detail?: (row: UsageAccount) => string | undefined,
): DrillRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    owner: row.owner,
    arr: row.arr,
    detail: detail?.(row),
  }));
}

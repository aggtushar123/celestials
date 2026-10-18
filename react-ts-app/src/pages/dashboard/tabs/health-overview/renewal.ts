import type {
  HealthDataRow,
  HealthStatus,
} from "../../../../features/health/types";
import { daysToRenewal, renewalDateOf } from "./triage";

/**
 * The renewal book, read as money rather than as accounts.
 *
 * Every other Health Overview tab counts accounts. This one counts dollars,
 * because a renewal is a revenue event: twelve healthy logos renewing next
 * quarter and one shaky one worth more than all of them is a good quarter with
 * a problem in it, and a chart of account counts says the opposite.
 *
 * The Movement tab's renewal runway is deliberately not this. That one answers
 * "how many accounts renew when, and how healthy are they" as context for a
 * trend; this answers "what is the money, where is it exposed, and who has to
 * act on it this month".
 *
 * ## Rows with no ARR
 *
 * `arr` is null when the customer's contract currency has no exchange rate
 * configured, so the backend refused to guess (see the health endpoint). Those
 * rows are counted in the *account* figures and left out of every *money*
 * figure, and each total reports how many it left out. The alternative —
 * treating an unconverted amount as if it were already in the reporting
 * currency — produces a confident wrong number, which is the one outcome worse
 * than an incomplete one.
 */

/** Windows the book is sliced into, nearest first. `to` is exclusive. */
export const RENEWAL_WINDOWS = [
  { key: "overdue", label: "Overdue", from: -Infinity, to: 0 },
  { key: "30", label: "Next 30 days", from: 0, to: 31 },
  { key: "60", label: "31–60 days", from: 31, to: 61 },
  { key: "90", label: "61–90 days", from: 61, to: 91 },
  { key: "180", label: "91–180 days", from: 91, to: 181 },
] as const;

export type RenewalWindowKey = (typeof RENEWAL_WINDOWS)[number]["key"];

/** The horizon the headline figures speak for. A quarter is the unit a renewal
 *  forecast is actually managed in, and it is far enough out that a save is
 *  still possible — inside 30 days the outcome is largely already decided. */
export const HEADLINE_HORIZON_DAYS = 90;

/** How far out the quarterly chart looks. Six quarters covers this year and
 *  next year's first half, which is as far as a renewal date is worth
 *  planning against; beyond that the dates themselves are guesses. */
export const QUARTERS_AHEAD = 6;

/**
 * Contact age thresholds, in days since the last logged activity.
 *
 * `FRESH` is a month because that is the cadence a CSM is expected to keep on
 * a named account; `COLD` is two, the point at which a renewal conversation
 * has to start from scratch rather than continue.
 */
export const CONTACT_FRESH_DAYS = 30;
export const CONTACT_COLD_DAYS = 60;

export type Coverage = "fresh" | "ageing" | "cold" | "unknown";

export function coverageOf(row: HealthDataRow): Coverage {
  if (row.daysSinceTouch === null) return "unknown";
  if (row.daysSinceTouch <= CONTACT_FRESH_DAYS) return "fresh";
  if (row.daysSinceTouch <= CONTACT_COLD_DAYS) return "ageing";
  return "cold";
}

/**
 * The probability this renewal is lost, and what produced it.
 *
 * **The rule itself lives in the backend** (`services/customers/churn.py`) and
 * arrives on the row. It used to live here, which was fine while this tab was
 * its only reader; the Revenue Forecast needs the same number about the same
 * account, and two implementations of a churn model that both drive money on
 * screen is a discrepancy with a date on it.
 *
 * What stays here is the *reading* of it — which thresholds this tab shows,
 * and how it ranks by the result.
 */
export interface RiskFactor {
  label: string;
  points: number;
}

export function riskOfLoss(row: HealthDataRow): { risk: number; factors: RiskFactor[] } {
  return { risk: row.riskOfLoss, factors: row.riskFactors };
}

export interface RenewalRow {
  row: HealthDataRow;
  days: number;
  windowKey: RenewalWindowKey | null;
  coverage: Coverage;
  risk: number;
  factors: RiskFactor[];
  /** ARR × risk — the money this renewal is expected to cost if it goes the
   *  way the factors above suggest. Null when the ARR couldn't be converted. */
  exposure: number | null;
}

function windowFor(days: number): RenewalWindowKey | null {
  const found = RENEWAL_WINDOWS.find((w) => days >= w.from && days < w.to);
  return found ? found.key : null;
}

/**
 * Every account with a renewal date, scored.
 *
 * An account with no renewal date recorded is absent, not sorted to the end:
 * this tab is about dated commitments, and a blank date is a CRM gap rather
 * than a renewal far in the future. `withoutDate` counts them so the view can
 * say how much of the book it can't speak for.
 */
export function renewalRows(
  rows: HealthDataRow[],
  now: Date = new Date(),
): { rows: RenewalRow[]; withoutDate: number } {
  const scored: RenewalRow[] = [];
  let withoutDate = 0;

  for (const row of rows) {
    const days = daysToRenewal(row, now);
    if (days === null) {
      withoutDate += 1;
      continue;
    }
    const { risk, factors } = riskOfLoss(row);
    scored.push({
      row,
      days,
      windowKey: windowFor(days),
      coverage: coverageOf(row),
      risk,
      factors,
      exposure: row.arr === null ? null : row.arr * risk,
    });
  }

  return { rows: scored, withoutDate };
}

export interface RenewalSummary {
  /** Renewals inside the headline horizon. */
  count: number;
  arr: number;
  /** Rows in the horizon whose ARR couldn't be converted. */
  unpriced: number;
  /** Σ ARR × risk across the horizon — the forecast loss, not the whole book. */
  exposure: number;
  /** Renewals in the horizon with no contact in CONTACT_COLD_DAYS. */
  coldCount: number;
  coldArr: number;
  /** Renewal dates already passed, which is a real and urgent state: either
   *  the renewal slipped or nobody updated the record after it closed. */
  overdueCount: number;
  overdueArr: number;
}

export interface RenewalDrillSets {
  /** Behind "Up for renewal" — inside the headline horizon, dated or not. */
  upForRenewal: RenewalRow[];
  /** Of those, the ones with a convertible ARR — behind "Forecast at risk". */
  forecastAtRisk: RenewalRow[];
  /** Of those, the ones nobody has logged an activity on recently — behind
   *  "No recent contact". */
  noRecentContact: RenewalRow[];
  /** Renewal dates already passed — behind "Past due". */
  pastDue: RenewalRow[];
}

/**
 * The four account sets behind the Renewal tab's headline tiles.
 *
 * `summarise`'s totals and each tile's drill both read this — one predicate
 * per figure, defined once, so a tile's number and the accounts a click on it
 * opens can never quietly diverge.
 */
export function renewalDrillSets(scored: RenewalRow[]): RenewalDrillSets {
  const upForRenewal = scored.filter(
    (item) => item.days >= 0 && item.days <= HEADLINE_HORIZON_DAYS,
  );

  return {
    upForRenewal,
    // Priced and actually carrying some weighted exposure: a row at $0 adds
    // nothing to the tile's sum, so listing it would only read "$0 at risk".
    forecastAtRisk: upForRenewal.filter((item) => item.exposure !== null && item.exposure > 0),
    noRecentContact: upForRenewal.filter((item) => item.coverage === "cold"),
    pastDue: scored.filter((item) => item.days < 0),
  };
}

export function summarise(scored: RenewalRow[]): RenewalSummary {
  const { upForRenewal, forecastAtRisk, noRecentContact, pastDue } =
    renewalDrillSets(scored);

  const sumArr = (items: RenewalRow[]) =>
    items.reduce((sum, item) => sum + (item.row.arr ?? 0), 0);

  return {
    count: upForRenewal.length,
    arr: sumArr(upForRenewal),
    unpriced: upForRenewal.filter((item) => item.row.arr === null).length,
    exposure: forecastAtRisk.reduce((sum, item) => sum + (item.exposure ?? 0), 0),
    coldCount: noRecentContact.length,
    coldArr: sumArr(noRecentContact),
    overdueCount: pastDue.length,
    overdueArr: sumArr(pastDue),
  };
}

export interface QuarterColumn {
  /** Sortable key, e.g. "2026-Q3". */
  key: string;
  /** Axis label, e.g. "Q3 '26". */
  label: string;
  arr: Record<HealthStatus, number>;
  total: number;
  count: number;
  /** The exact accounts behind each of `arr` — what the calendar chart's
   *  quarter × health segment drills into. Always the same length as the
   *  matching `arr` entry would suggest (one row per renewing account, not
   *  per dollar). */
  rows: Record<HealthStatus, HealthDataRow[]>;
}

const QUARTER_OF = (date: Date) => Math.floor(date.getMonth() / 3) + 1;

/**
 * ARR by the calendar quarter it renews in, split by current health.
 *
 * Quarters rather than months because a renewal book is planned and reported
 * quarterly, and twelve monthly bars of a fifteen-account book are mostly
 * empty. The series runs continuously from the current quarter so a quarter
 * with nothing renewing reads as a gap in the schedule rather than vanishing
 * and making the next one look adjacent.
 *
 * Overdue renewals are not here. They belong to a date that has passed, and
 * hanging them off the current quarter would inflate a number people commit
 * to; the summary calls them out separately instead.
 */
export function quarterColumns(
  scored: RenewalRow[],
  now: Date = new Date(),
  quarters: number = QUARTERS_AHEAD,
): QuarterColumn[] {
  const columns: QuarterColumn[] = [];
  const start = new Date(
    now.getFullYear(),
    Math.floor(now.getMonth() / 3) * 3,
    1,
  );

  for (let i = 0; i < quarters; i += 1) {
    const at = new Date(start.getFullYear(), start.getMonth() + i * 3, 1);
    const quarter = QUARTER_OF(at);
    columns.push({
      key: `${at.getFullYear()}-Q${quarter}`,
      label: `Q${quarter} '${String(at.getFullYear()).slice(2)}`,
      arr: { Good: 0, Average: 0, Poor: 0 },
      total: 0,
      count: 0,
      rows: { Good: [], Average: [], Poor: [] },
    });
  }

  const byKey = new Map(columns.map((c) => [c.key, c]));

  for (const item of scored) {
    if (item.days < 0) continue;
    const date = renewalDateOf(item.row, now);
    if (date === null) continue;

    const column = byKey.get(`${date.getFullYear()}-Q${QUARTER_OF(date)}`);
    if (!column) continue;

    column.count += 1;
    const arr = item.row.arr ?? 0;
    column.arr[item.row.healthStatus] += arr;
    column.total += arr;
    column.rows[item.row.healthStatus].push(item.row);
  }

  return columns;
}

export interface CoverageBand {
  key: RenewalWindowKey;
  label: string;
  fresh: number;
  ageing: number;
  cold: number;
  unknown: number;
  total: number;
  count: number;
  /** The exact accounts behind each contact-age figure — what the coverage
   *  chart's window × contact-age segment drills into. */
  rows: Record<Coverage, HealthDataRow[]>;
}

/**
 * ARR per renewal window, split by how recently the account was contacted.
 *
 * The chart a renewals meeting is actually run off: it shows the money that
 * renews soon *and* has nobody talking to it, which is the only combination
 * worth interrupting someone's week over. Health is deliberately absent —
 * that's the quarter chart's axis, and a Good account nobody has spoken to in
 * three months is exactly the case a health-only view misses.
 */
export function coverageBands(scored: RenewalRow[]): CoverageBand[] {
  return RENEWAL_WINDOWS.map((window) => {
    const band: CoverageBand = {
      key: window.key,
      label: window.label,
      fresh: 0,
      ageing: 0,
      cold: 0,
      unknown: 0,
      total: 0,
      count: 0,
      rows: { fresh: [], ageing: [], cold: [], unknown: [] },
    };

    for (const item of scored) {
      if (item.windowKey !== window.key) continue;
      const arr = item.row.arr ?? 0;
      band[item.coverage] += arr;
      band.total += arr;
      band.count += 1;
      band.rows[item.coverage].push(item.row);
    }

    return band;
  });
}

export interface OwnerLoad {
  owner: string;
  /** What the grouping actually keys on — two CSMs who happen to share a
   *  display name stay two separate entries here, same reason `owner`/
   *  `ownerKey` are split on `HealthDataRow` itself. */
  ownerKey: string;
  /** ARR renewing inside the horizon. */
  arr: number;
  /** Σ ARR × risk for the same set — the part of that book at risk. */
  exposure: number;
  count: number;
  /** The exact accounts behind `arr`/`count` — what a click on this owner's
   *  bar drills into. Same `0 <= days <= horizonDays` filter that built the
   *  totals, never re-filtered separately. */
  rows: HealthDataRow[];
}

/**
 * Renewal load per owner inside a horizon, heaviest first.
 *
 * A management view, not a leaderboard: it answers "who is carrying the
 * quarter, and is anyone carrying more exposure than one person can work".
 * Exposure rather than a simple at-risk count, because six shaky small
 * accounts and one shaky large one are not the same amount of trouble.
 *
 * Grouped by `ownerKey`, not by the display name: two CSMs named the same
 * thing are a real, if rare, thing in an org this size, and keying on the
 * label would silently merge their books.
 */
export function ownerLoad(
  scored: RenewalRow[],
  horizonDays: number = 180,
): OwnerLoad[] {
  const byOwner = new Map<string, OwnerLoad>();

  for (const item of scored) {
    if (item.days < 0 || item.days > horizonDays) continue;
    const key = item.row.ownerKey;
    const entry = byOwner.get(key) ?? {
      owner: item.row.owner,
      ownerKey: key,
      arr: 0,
      exposure: 0,
      count: 0,
      rows: [],
    };
    entry.arr += item.row.arr ?? 0;
    entry.exposure += item.exposure ?? 0;
    entry.count += 1;
    entry.rows.push(item.row);
    byOwner.set(key, entry);
  }

  return [...byOwner.values()].sort(
    (a, b) => b.arr - a.arr || a.owner.localeCompare(b.owner),
  );
}

/**
 * The renewals to work, highest expected loss first.
 *
 * Ranked by exposure rather than by ARR or by health alone: the biggest
 * contract is not the one most likely to leave, and the sickest account may be
 * worth a rounding error. Overdue renewals sort first regardless of size,
 * because a date that has already passed needs an answer today whatever it is
 * worth.
 *
 * Rows with no convertible ARR can't be ranked by money, so they sort last on
 * risk alone rather than being dropped — the account still needs working.
 */
export function renewalQueue(
  scored: RenewalRow[],
  horizonDays: number = HEADLINE_HORIZON_DAYS,
): RenewalRow[] {
  return scored
    .filter((item) => item.days <= horizonDays)
    .sort((a, b) => {
      const overdue = Number(b.days < 0) - Number(a.days < 0);
      if (overdue !== 0) return overdue;
      if (a.exposure === null || b.exposure === null) {
        if (a.exposure !== b.exposure) return a.exposure === null ? 1 : -1;
        return b.risk - a.risk;
      }
      return b.exposure - a.exposure || a.days - b.days;
    });
}

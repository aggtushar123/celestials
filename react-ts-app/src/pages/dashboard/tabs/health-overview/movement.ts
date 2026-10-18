import type { HealthDataRow, HealthStatus } from './mockData';
import { daysToRenewal, renewalDateOf } from './triage';

/** Worst to best. A step up this ladder is an account improving a grade. */
export const STATUS_LADDER: HealthStatus[] = ['Poor', 'Average', 'Good'];

/** Stacking order for a month column, best at the top. */
export const STACK_ORDER: HealthStatus[] = ['Good', 'Average', 'Poor'];

/** Window lengths the view offers, in months. */
export const WINDOW_OPTIONS = [3, 6, 12] as const;
export type WindowMonths = (typeof WINDOW_OPTIONS)[number];

export interface MonthColumn {
  /** The full label as stored, e.g. "Aug 31, 2026". */
  label: string;
  /** Just the month, for an axis that has to fit twelve of them. */
  short: string;
  counts: Record<HealthStatus, number>;
  total: number;
}

export interface Transition {
  from: HealthStatus;
  to: HealthStatus;
  count: number;
  /** 'declined' | 'improved' | 'held' — which way along STATUS_LADDER. */
  direction: 'declined' | 'improved' | 'held';
}

export interface Flow {
  months: MonthColumn[];
  /** `steps[i]` holds the transitions from `months[i]` to `months[i + 1]`,
   *  so there is always one fewer step than there are months. */
  steps: Transition[][];
  /** Accounts counted in the flow — those carrying history for these months. */
  tracked: number;
}

const emptyCounts = (): Record<HealthStatus, number> => ({ Good: 0, Average: 0, Poor: 0 });

/**
 * The canonical month labels across a book, oldest first.
 *
 * Taken from whichever account carries the most history rather than the first
 * one, because at least one seeded row has none at all and would otherwise
 * decide there are no months to draw.
 */
export function monthsOf(rows: HealthDataRow[]): string[] {
  let longest: HealthDataRow | undefined;
  for (const row of rows) {
    if ((row.history?.length ?? 0) > (longest?.history?.length ?? 0)) longest = row;
  }
  return (longest?.history ?? []).map((h) => h.month);
}

const shortLabel = (label: string) => label.split(' ')[0] || label;

function directionOf(from: HealthStatus, to: HealthStatus): Transition['direction'] {
  const delta = STATUS_LADDER.indexOf(to) - STATUS_LADDER.indexOf(from);
  if (delta < 0) return 'declined';
  if (delta > 0) return 'improved';
  return 'held';
}

/**
 * The window's canonical months, and each account's status in every one of
 * them — aligned by label rather than by position, so an account carrying a
 * shorter or differently-aligned history contributes to the months it
 * actually has instead of being silently shifted along the axis.
 *
 * The one place that decides "which months are in this window, and what did
 * each account read in each" — `buildFlow`'s columns and steps, `netMovement`'s
 * totals, and `moveCounts`'/`movedRows`'/the drill detail's per-account counts
 * all read it, so a window can never mean one thing for the Movement tiles'
 * figure and another for the accounts a click on it opens.
 */
function windowedTrails(
  rows: HealthDataRow[],
  windowMonths: number,
): { months: string[]; trails: (HealthStatus | undefined)[][] } {
  const all = monthsOf(rows);
  const months = windowMonths > 0 ? all.slice(-windowMonths) : all;
  const trails = rows.map((row) => {
    const byLabel = new Map((row.history ?? []).map((h) => [h.month, h.status]));
    return months.map((label) => byLabel.get(label));
  });
  return { months, trails };
}

/**
 * Build the month columns and the transitions between them.
 *
 * Rows are matched to months by label rather than by position, so an account
 * carrying a shorter or differently-aligned history contributes to the months
 * it actually has instead of being silently shifted along the axis.
 */
export function buildFlow(rows: HealthDataRow[], windowMonths = 12): Flow {
  const { months, trails } = windowedTrails(rows, windowMonths);

  if (months.length === 0) return { months: [], steps: [], tracked: 0 };

  const columns: MonthColumn[] = months.map((label, i) => {
    const counts = emptyCounts();
    let total = 0;
    for (const statuses of trails) {
      const status = statuses[i];
      if (status) {
        counts[status] += 1;
        total += 1;
      }
    }
    return { label, short: shortLabel(label), counts, total };
  });

  const steps: Transition[][] = [];
  for (let i = 0; i < months.length - 1; i++) {
    const tally = new Map<string, number>();
    for (const statuses of trails) {
      const from = statuses[i];
      const to = statuses[i + 1];
      // An account only contributes to a step if it was present for both ends.
      if (!from || !to) continue;
      const key = `${from}>${to}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }

    const transitions: Transition[] = [];
    // Iterate the ladder rather than the map, so ribbon order is deterministic
    // and stacking lines up with the columns either side.
    for (const from of STACK_ORDER) {
      for (const to of STACK_ORDER) {
        const count = tally.get(`${from}>${to}`) ?? 0;
        if (count > 0) transitions.push({ from, to, count, direction: directionOf(from, to) });
      }
    }
    steps.push(transitions);
  }

  return {
    months: columns,
    steps,
    tracked: trails.filter((s) => s.some(Boolean)).length,
  };
}

export interface NetMovement {
  improved: number;
  declined: number;
  held: number;
  /** improved − declined, over the whole window. */
  net: number;
}

/**
 * How many account-months moved each way across the window.
 *
 * Counts moves, not accounts: an account that fell and recovered contributes
 * to both sides, which is the honest reading of "how much did this book move".
 */
export function netMovement(flow: Flow): NetMovement {
  let improved = 0;
  let declined = 0;
  let held = 0;

  for (const step of flow.steps) {
    for (const t of step) {
      if (t.direction === 'improved') improved += t.count;
      else if (t.direction === 'declined') declined += t.count;
      else held += t.count;
    }
  }

  return { improved, declined, held, net: improved - declined };
}

export interface RenewalBucket {
  label: string;
  /** Inclusive lower bound in days; `to` is exclusive, null for open-ended. */
  from: number;
  to: number | null;
  counts: Record<HealthStatus, number>;
  total: number;
  /** Accounts in this bucket that are not currently Good. */
  atRisk: number;
  /** The exact accounts behind each of `counts` — what the runway chart's
   *  bucket × health segment drills into. Always the same length as the
   *  matching `counts` entry. */
  rows: Record<HealthStatus, HealthDataRow[]>;
}

const BUCKET_BOUNDS: { label: string; from: number; to: number | null }[] = [
  { label: '0–90 days', from: 0, to: 90 },
  { label: '91–180 days', from: 90, to: 180 },
  { label: '181–270 days', from: 180, to: 270 },
  { label: '271+ days', from: 270, to: null },
];

/**
 * Accounts grouped by how far out they renew, split by current health.
 *
 * Accounts whose renewal date has already passed fall into the first bucket —
 * an overdue renewal is the most urgent case, not one to drop off the chart.
 */
export function renewalBuckets(rows: HealthDataRow[], now: Date = new Date()): RenewalBucket[] {
  const buckets: RenewalBucket[] = BUCKET_BOUNDS.map((b) => ({
    ...b,
    counts: emptyCounts(),
    total: 0,
    atRisk: 0,
    rows: { Good: [], Average: [], Poor: [] },
  }));

  for (const row of rows) {
    const days = daysToRenewal(row, now);
    if (days === null) continue;

    const bucket =
      buckets.find((b) => days < (b.to ?? Infinity) && days >= (b.from === 0 ? -Infinity : b.from)) ??
      buckets[buckets.length - 1];

    bucket.counts[row.healthStatus] += 1;
    bucket.total += 1;
    bucket.rows[row.healthStatus].push(row);
    if (row.healthStatus !== 'Good') bucket.atRisk += 1;
  }

  return buckets;
}

export interface MoveCounts {
  /** How many times this account dropped a grade inside the window. */
  declined: number;
  /** How many times this account rose a grade inside the window. */
  improved: number;
}

/**
 * How many times each account moved a grade, up or down, inside the window —
 * from the exact same canonical-month alignment `buildFlow` uses for its own
 * columns and steps, keyed by account id.
 *
 * Summing `declined` (or `improved`) across every row here always equals
 * `netMovement`'s own `declined` (or `improved`) for the same `rows` and
 * `windowMonths`: both are counting the same (account, month-to-month step)
 * transitions over `windowedTrails`, just grouped differently — by account
 * here, by step there. That equality is what lets the Movement tiles' drill
 * panel show a per-row "N downgrades"/"N upgrades" detail that visibly adds
 * up to the tile's own figure, rather than the two silently drifting apart.
 */
export function moveCounts(rows: HealthDataRow[], windowMonths: number): Map<string, MoveCounts> {
  const { trails } = windowedTrails(rows, windowMonths);
  const byId = new Map<string, MoveCounts>();

  rows.forEach((row, i) => {
    const trail = trails[i];
    let declined = 0;
    let improved = 0;
    for (let j = 1; j < trail.length; j++) {
      const from = trail[j - 1];
      const to = trail[j];
      // Same rule as buildFlow's steps: a gap on either end contributes to
      // no transition, rather than comparing across a missing month.
      if (!from || !to) continue;
      const delta = STATUS_LADDER.indexOf(to) - STATUS_LADDER.indexOf(from);
      if (delta < 0) declined += 1;
      else if (delta > 0) improved += 1;
    }
    byId.set(row.id, { declined, improved });
  });

  return byId;
}

/**
 * Accounts that moved a grade — up or down — inside the window, from the
 * same per-account counts `moveCounts` computes.
 *
 * Unlike `netMovement`, which counts moves (an account that fell and
 * recovered contributes to both `declined` and `improved`), this counts
 * *accounts* — the Movement tiles' drill lists each one once per direction,
 * however many times it crossed a grade within the window. `windowMonths <=
 * 0` means the full history, matching `buildFlow`'s own rule.
 */
export function movedRows(
  rows: HealthDataRow[],
  windowMonths: number,
  direction: keyof MoveCounts,
): HealthDataRow[] {
  const counts = moveCounts(rows, windowMonths);
  return rows.filter((row) => (counts.get(row.id)?.[direction] ?? 0) > 0);
}

export interface RenewalMonth {
  /** Sortable key, e.g. "2026-09". */
  key: string;
  /** Full label, e.g. "Sep 2026". Used in the tooltip. */
  label: string;
  /** Compact form, e.g. "Sep '26" — twelve rotated full labels don't fit. */
  short: string;
  counts: Record<HealthStatus, number>;
  total: number;
  /** The exact accounts behind each of `counts` — what the renewal-date
   *  chart's month × health segment drills into. */
  rows: Record<HealthStatus, HealthDataRow[]>;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Accounts grouped by the calendar month they renew in, split by health.
 *
 * The series runs continuously from the earliest renewal month to the latest,
 * including months nothing renews in. Dropping empty months would compress the
 * axis and make a quiet stretch look like a busy one — the gaps are the point
 * of a renewal timeline.
 */
export function renewalMonths(rows: HealthDataRow[], now: Date = new Date()): RenewalMonth[] {
  const found = new Map<string, Record<HealthStatus, number>>();
  const foundRows = new Map<string, Record<HealthStatus, HealthDataRow[]>>();
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const row of rows) {
    const date = renewalDateOf(row, now);
    if (!date) continue;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const counts = found.get(key) ?? emptyCounts();
    counts[row.healthStatus] += 1;
    found.set(key, counts);

    const monthRows = foundRows.get(key) ?? { Good: [], Average: [], Poor: [] };
    monthRows[row.healthStatus].push(row);
    foundRows.set(key, monthRows);

    if (!earliest || date < earliest) earliest = date;
    if (!latest || date > latest) latest = date;
  }

  if (!earliest || !latest) return [];

  const months: RenewalMonth[] = [];
  const cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const end = new Date(latest.getFullYear(), latest.getMonth(), 1);

  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const counts = found.get(key) ?? emptyCounts();
    months.push({
      key,
      label: `${MONTH_ABBR[cursor.getMonth()]} ${cursor.getFullYear()}`,
      short: `${MONTH_ABBR[cursor.getMonth()]} '${String(cursor.getFullYear()).slice(-2)}`,
      counts,
      total: counts.Good + counts.Average + counts.Poor,
      rows: foundRows.get(key) ?? { Good: [], Average: [], Poor: [] },
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

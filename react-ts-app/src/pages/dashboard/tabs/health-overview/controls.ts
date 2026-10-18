import type { HealthDataRow, HealthStatus } from '../../../../features/health/types';

/** One owner's book, counted by health band. */
export interface OwnerHealth {
  owner: string;
  /** What the grouping keys on — two owners sharing a display name stay two
   *  separate entries, the same split `HealthDataRow.owner`/`ownerKey` makes. */
  ownerKey: string;
  Poor: number;
  Average: number;
  Good: number;
  total: number;
  /** The exact accounts behind each count — what the chart's owner × health
   *  segment drills into. */
  rows: Record<HealthStatus, HealthDataRow[]>;
}

/** Stacked worst-first, so the red always sits against the axis and the red
 *  lengths can be compared without hunting for them. */
export const HEALTH_ORDER: HealthStatus[] = ['Poor', 'Average', 'Good'];

/**
 * Each owner's book, counted by health band, worst book first.
 *
 * **Counts, not percentages.** The chart this feeds used to divide each
 * owner's rows by their share of a fixed book, which made an owner with one
 * poor account out of one look exactly like an owner with one poor account out
 * of twenty — and only the second needs help, while the first needs a
 * conversation. Counts carry the size of the book and how much of it is sick
 * in the same bar.
 *
 * Owners come from the rows handed in, so a filtered view lists exactly the
 * owners in it. Order: most poor accounts, then most average, then biggest
 * book — the owner who needs help is the first bar.
 *
 * Grouped by `ownerKey`, not by the display name: two CSMs who happen to
 * share a name are a real thing in a big org, and keying on the label would
 * silently merge their books into one bar.
 */
export function healthByOwner(rows: HealthDataRow[]): OwnerHealth[] {
  const byOwner = new Map<string, OwnerHealth>();

  for (const row of rows) {
    let entry = byOwner.get(row.ownerKey);
    if (!entry) {
      entry = {
        owner: row.owner,
        ownerKey: row.ownerKey,
        Poor: 0,
        Average: 0,
        Good: 0,
        total: 0,
        rows: { Poor: [], Average: [], Good: [] },
      };
      byOwner.set(row.ownerKey, entry);
    }
    entry[row.healthStatus] += 1;
    entry.total += 1;
    entry.rows[row.healthStatus].push(row);
  }

  return [...byOwner.values()].sort(
    (a, b) => b.Poor - a.Poor || b.Average - a.Average || b.total - a.total || a.owner.localeCompare(b.owner),
  );
}

/** One 1–5 pulse score's book, split by current health. */
export interface PulseBucket {
  score: number;
  counts: Record<HealthStatus, number>;
  total: number;
  /** The exact accounts behind each count — what the CSM/AI Pulse bars'
   *  score × health segment drills into. */
  rows: Record<HealthStatus, HealthDataRow[]>;
}

const emptyPulseCounts = (): Record<HealthStatus, number> => ({ Good: 0, Average: 0, Poor: 0 });
const emptyPulseRows = (): Record<HealthStatus, HealthDataRow[]> => ({ Good: [], Average: [], Poor: [] });

/**
 * Accounts grouped by a 1–5 pulse score, split by current health.
 *
 * The CSM and AI Pulse bars both read this, keyed on whichever score field
 * they chart — one function so a bar's count and the accounts a click on it
 * opens can never drift apart. An account nobody has rated (`score` null)
 * belongs in no bucket, not the lowest one.
 */
export function pulseBuckets(
  rows: HealthDataRow[],
  field: 'csmPulseScore' | 'aiPulseScore',
): PulseBucket[] {
  const buckets: PulseBucket[] = [1, 2, 3, 4, 5].map((score) => ({
    score,
    counts: emptyPulseCounts(),
    total: 0,
    rows: emptyPulseRows(),
  }));

  for (const row of rows) {
    const score = row[field];
    if (score === null || score < 1 || score > 5) continue;
    const bucket = buckets[score - 1];
    bucket.counts[row.healthStatus] += 1;
    bucket.total += 1;
    bucket.rows[row.healthStatus].push(row);
  }

  return buckets;
}

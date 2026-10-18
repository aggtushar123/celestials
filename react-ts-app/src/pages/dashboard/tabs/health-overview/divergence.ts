import type { HealthDataRow } from '../../../../features/health/types';
import { daysToRenewal } from './triage';

/**
 * How far the two pulses have to be apart before they count as disagreeing.
 *
 * One point is noise — the scores are integers on a five-point scale, and a
 * CSM rounding 3.5 up while the model rounds down isn't a signal. Two is a
 * genuine difference of opinion about the account.
 */
export const DIVERGENCE_THRESHOLD = 2;

/**
 * The boundary between a "low" and a "high" pulse, for quadrant purposes.
 *
 * Sits between 3 and 4 rather than on 3, so the neutral middle score falls on
 * the cautious side. An account both parties scored 3 is not a healthy one.
 */
export const PULSE_MIDPOINT = 3.5;

/** 'unrated' when either side hasn't scored the account — it has no position
 *  on these axes at all, which is not the same as sitting on the diagonal. */
export type DivergenceKind = 'ai-colder' | 'csm-colder' | 'aligned' | 'unrated';

export type Quadrant = 'aligned-healthy' | 'aligned-at-risk' | 'ai-flags' | 'csm-flags';

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  'aligned-healthy': 'Aligned · healthy',
  'aligned-at-risk': 'Aligned · at risk',
  'ai-flags': 'AI flags risk, CSM doesn’t',
  'csm-flags': 'CSM flags risk, AI doesn’t',
};

export interface DivergenceRow {
  row: HealthDataRow;
  /** csmPulseScore − aiPulseScore, or null when either side hasn't rated it. */
  gap: number | null;
  kind: DivergenceKind;
  /** Null for an unrated account — it can't be placed in a quadrant. */
  quadrant: Quadrant | null;
  daysToRenewal: number | null;
  /** Plot position, nudged off the integer grid so co-located accounts stay
   *  individually visible and countable. Null when the account can't be
   *  plotted, so the scatter leaves it out rather than dropping it at (0,0). */
  x: number | null;
  y: number | null;
}

/** True when both sides have scored this account, so it has a position. */
export function isRated(row: HealthDataRow): boolean {
  return row.csmPulseScore !== null && row.aiPulseScore !== null;
}

export function gapOf(row: HealthDataRow): number | null {
  if (!isRated(row)) return null;
  return (row.csmPulseScore as number) - (row.aiPulseScore as number);
}

export function kindOf(row: HealthDataRow): DivergenceKind {
  const gap = gapOf(row);
  // Unrated, not aligned: nobody has said these two agree.
  if (gap === null) return 'unrated';
  if (gap >= DIVERGENCE_THRESHOLD) return 'ai-colder';
  if (gap <= -DIVERGENCE_THRESHOLD) return 'csm-colder';
  return 'aligned';
}

export function quadrantOf(row: HealthDataRow): Quadrant | null {
  if (!isRated(row)) return null;
  const csmHigh = (row.csmPulseScore as number) >= PULSE_MIDPOINT;
  const aiHigh = (row.aiPulseScore as number) >= PULSE_MIDPOINT;
  if (csmHigh && aiHigh) return 'aligned-healthy';
  if (!csmHigh && !aiHigh) return 'aligned-at-risk';
  return csmHigh ? 'ai-flags' : 'csm-flags';
}

/** Radius, in axis units, of each successive ring of co-located points. */
const RING_STEP = 0.13;
/** Points placed around each ring before starting the next one out. */
const RING_CAPACITY = 8;

/**
 * Lay out one point per account, spreading accounts that share a score pair.
 *
 * Both pulses are integers 1–5, so a plain scatter collapses the whole book
 * onto at most 25 pixels — eleven accounts can sit under a single dot. Rather
 * than random jitter (which reshuffles on every render and can still overlap),
 * accounts in the same cell are placed on concentric rings in a stable order:
 * the same book always draws the same picture, and every account is clickable.
 */
export function layOut(rows: HealthDataRow[], now: Date = new Date()): DivergenceRow[] {
  const seenInCell = new Map<string, number>();

  return rows.map((row) => {
    if (!isRated(row)) {
      return {
        row,
        gap: null,
        kind: 'unrated' as const,
        quadrant: null,
        daysToRenewal: daysToRenewal(row, now),
        x: null,
        y: null,
      };
    }

    const cell = `${row.csmPulseScore},${row.aiPulseScore}`;
    const index = seenInCell.get(cell) ?? 0;
    seenInCell.set(cell, index + 1);

    // First account sits dead on the score; the rest ring outwards around it.
    let dx = 0;
    let dy = 0;
    if (index > 0) {
      const ring = Math.floor((index - 1) / RING_CAPACITY) + 1;
      const slot = (index - 1) % RING_CAPACITY;
      // Offset each ring's start angle so rings don't line up into spokes.
      const angle = (slot / RING_CAPACITY) * Math.PI * 2 + ring * 0.55;
      dx = Math.cos(angle) * RING_STEP * ring;
      dy = Math.sin(angle) * RING_STEP * ring;
    }

    return {
      row,
      gap: gapOf(row),
      kind: kindOf(row),
      quadrant: quadrantOf(row),
      daysToRenewal: daysToRenewal(row, now),
      x: (row.csmPulseScore as number) + dx,
      y: (row.aiPulseScore as number) + dy,
    };
  });
}

export interface DivergenceSplit {
  /** The AI reads colder than the CSM — the blind-spot direction. */
  aiColder: DivergenceRow[];
  /** The CSM reads colder than the AI — a human catching something first. */
  csmColder: DivergenceRow[];
}

/**
 * The accounts the two pulses disagree on, each list soonest-renewal first.
 *
 * Renewal order rather than gap size: a three-point gap on an account with a
 * year of runway is interesting, but a two-point gap on one renewing in three
 * weeks is the call you have to make this week.
 */
export function splitDivergent(laid: DivergenceRow[]): DivergenceSplit {
  const byRenewal = (a: DivergenceRow, b: DivergenceRow) => {
    // Accounts with no parseable renewal date sort last rather than first.
    if (a.daysToRenewal === null) return b.daysToRenewal === null ? 0 : 1;
    if (b.daysToRenewal === null) return -1;
    return a.daysToRenewal - b.daysToRenewal;
  };

  return {
    aiColder: laid.filter((d) => d.kind === 'ai-colder').sort(byRenewal),
    csmColder: laid.filter((d) => d.kind === 'csm-colder').sort(byRenewal),
  };
}

export interface DivergenceSummary {
  total: number;
  agreeing: number;
  disagreeing: number;
  aiColder: number;
  csmColder: number;
  /** Disagreements where the AI is colder *and* the renewal is inside 90 days. */
  urgentBlindSpots: number;
  /** Accounts one side or the other hasn't rated. They can't be plotted and
   *  aren't counted as agreeing — the view reports them separately. */
  unrated: number;
  byQuadrant: Record<Quadrant, number>;
}

export function summariseDivergence(laid: DivergenceRow[]): DivergenceSummary {
  const byQuadrant: Record<Quadrant, number> = {
    'aligned-healthy': 0,
    'aligned-at-risk': 0,
    'ai-flags': 0,
    'csm-flags': 0,
  };
  // An unrated account has no quadrant, so it contributes to none of them.
  laid.forEach((d) => {
    if (d.quadrant !== null) byQuadrant[d.quadrant] += 1;
  });

  const aiColder = laid.filter((d) => d.kind === 'ai-colder');
  const csmColder = laid.filter((d) => d.kind === 'csm-colder');
  const unrated = laid.filter((d) => d.kind === 'unrated');

  return {
    total: laid.length,
    // Counted only over the accounts both sides actually scored — an unrated
    // account is not evidence of agreement.
    agreeing: laid.length - aiColder.length - csmColder.length - unrated.length,
    disagreeing: aiColder.length + csmColder.length,
    aiColder: aiColder.length,
    csmColder: csmColder.length,
    urgentBlindSpots: aiColder.filter(
      (d) => d.daysToRenewal !== null && d.daysToRenewal <= 90,
    ).length,
    unrated: unrated.length,
    byQuadrant,
  };
}

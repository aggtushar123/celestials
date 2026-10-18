import { describe, it, expect } from 'vitest';
import type { HealthStatus } from '../../../../features/health/types';
import { healthRow } from './testUtils';
import {
  ACTION_THRESHOLD,
  daysToRenewal,
  scoreRow,
  summarise,
  trajectoryOf,
  triage,
  triageDrillSets,
} from './triage';

// Unit tier: the scoring is the product decision behind the Triage view, so
// it's tested on fixtures rather than on MOCK_HEALTH_DATA — that data is
// generated with Math.random() at import time and would make these flaky.

/** Local midnight, so date-fns' calendar-day maths doesn't straddle a TZ edge. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

const makeRow = healthRow;

const history = (...statuses: HealthStatus[]) =>
  statuses.map((status, i) => ({ month: `M${i}`, status }));

describe('daysToRenewal', () => {
  it('counts calendar days to the renewal date', () => {
    expect(daysToRenewal(makeRow({ renewalDate: 'Dec 31, 2026' }), NOW)).toBe(199);
    expect(daysToRenewal(makeRow({ renewalDate: 'Jul 15, 2026' }), NOW)).toBe(30);
  });

  it('is negative once the renewal is in the past', () => {
    expect(daysToRenewal(makeRow({ renewalDate: 'Jun 1, 2026' }), NOW)).toBe(-14);
  });

  it('returns null rather than NaN for a missing or unparseable date', () => {
    expect(daysToRenewal(makeRow({ renewalDate: '' }), NOW)).toBeNull();
    expect(daysToRenewal(makeRow({ renewalDate: 'whenever' }), NOW)).toBeNull();
    expect(daysToRenewal(makeRow({ renewalDate: '2026-12-31' }), NOW)).toBeNull();
  });
});

describe('trajectoryOf', () => {
  it('reads direction from the first and last month recorded', () => {
    expect(trajectoryOf(makeRow({ history: history('Good', 'Good', 'Average') })).direction)
      .toBe('declining');
    expect(trajectoryOf(makeRow({ history: history('Average', 'Average', 'Good') })).direction)
      .toBe('improving');
    expect(trajectoryOf(makeRow({ history: history('Good', 'Average', 'Good') })).direction)
      .toBe('flat');
  });

  it('treats too little history as unknown rather than flat', () => {
    // One seeded row in mockData ships with history: [] — it must not read as
    // "stable", which is what a naive first-vs-last comparison would say.
    expect(trajectoryOf(makeRow({ history: [] })).direction).toBe('unknown');
    expect(trajectoryOf(makeRow({ history: history('Poor') })).direction).toBe('unknown');
  });

  it('exposes the trail oldest to newest', () => {
    expect(trajectoryOf(makeRow({ history: history('Good', 'Average', 'Poor') })).trail)
      .toEqual(['Good', 'Average', 'Poor']);
  });
});

describe('scoreRow', () => {
  // The weighting itself moved server-side (a Python port of this file's old
  // scoring, served on /customers/health/ as triage_score / triage_factors /
  // triage_direction) so the Renewal Forecast and this screen can never
  // disagree about the same account. scoreRow's job now is just to carry
  // that verbatim alongside what's still computed here.

  it('reads the score, factors and direction the server sent, verbatim', () => {
    const factors = [
      { label: 'Health is Poor', points: 66 },
      { label: 'Renews in 30d', points: 18 },
    ];
    const t = scoreRow(
      makeRow({ triageScore: 84, triageFactors: factors, triageDirection: 'declining' }),
      NOW,
    );
    expect(t.score).toBe(84);
    expect(t.factors).toEqual(factors);
    expect(t.direction).toBe('declining');
  });

  it('does not invent a score or factors when the server sent none', () => {
    const t = scoreRow(makeRow({ triageScore: 0, triageFactors: [], triageDirection: 'unknown' }), NOW);
    expect(t.score).toBe(0);
    expect(t.factors).toEqual([]);
    expect(t.direction).toBe('unknown');
  });

  it('still computes daysToRenewal, pulseGap and trail itself', () => {
    const t = scoreRow(
      makeRow({
        renewalDate: 'Jul 15, 2026',
        csmPulseScore: 5,
        aiPulseScore: 2,
        history: history('Good', 'Average', 'Poor'),
        triageScore: 0,
        triageFactors: [],
        // The server's own direction may disagree with what a naive
        // first-vs-last read of `trail` would say — this pins that `trail`
        // is still read locally even while `direction` comes from the row.
        triageDirection: 'flat',
      }),
      NOW,
    );
    expect(t.daysToRenewal).toBe(30);
    expect(t.pulseGap).toBe(3);
    expect(t.trail).toEqual(['Good', 'Average', 'Poor']);
    expect(t.direction).toBe('flat');
  });

  it('reads a null pulse gap when either side has not rated the account', () => {
    expect(scoreRow(makeRow({ csmPulseScore: null, aiPulseScore: 4 }), NOW).pulseGap).toBeNull();
    expect(scoreRow(makeRow({ csmPulseScore: 4, aiPulseScore: null }), NOW).pulseGap).toBeNull();
  });
});

describe('triage', () => {
  it('ranks worst first, by the score the server computed', () => {
    const rows = [
      makeRow({ id: '1', account: 'Calm', triageScore: 0 }),
      makeRow({ id: '2', account: 'Burning', triageScore: 90 }),
      makeRow({ id: '3', account: 'Wobbly', triageScore: 22 }),
    ];
    expect(triage(rows, NOW).map((t) => t.row.account)).toEqual(['Burning', 'Wobbly', 'Calm']);
  });

  it('breaks ties on account name so the order is stable', () => {
    const rows = [
      makeRow({ id: '1', account: 'Zeta', triageScore: 22 }),
      makeRow({ id: '2', account: 'Alpha', triageScore: 22 }),
      makeRow({ id: '3', account: 'Mid', triageScore: 22 }),
    ];
    const once = triage(rows, NOW).map((t) => t.row.account);
    const again = triage([...rows].reverse(), NOW).map((t) => t.row.account);
    expect(once).toEqual(['Alpha', 'Mid', 'Zeta']);
    expect(again).toEqual(once);
  });
});

describe('summarise', () => {
  it('counts the figures the tiles show', () => {
    const rows = [
      makeRow({
        id: '1',
        account: 'A',
        healthStatus: 'Poor',
        renewalDate: 'Jul 1, 2026',
        history: history('Good', 'Average', 'Poor'),
        triageScore: 66,
        triageDirection: 'declining',
      }),
      makeRow({
        id: '2',
        account: 'B',
        healthStatus: 'Good',
        csmPulseScore: 5,
        aiPulseScore: 2,
        triageScore: 0,
      }),
      makeRow({
        id: '3',
        account: 'C',
        healthStatus: 'Good',
        history: history('Good', 'Good', 'Good'),
        triageScore: 0,
        triageDirection: 'flat',
      }),
    ];
    const s = summarise(triage(rows, NOW));

    expect(s.total).toBe(3);
    expect(s.atGood).toBe(2);
    expect(s.declining).toBe(1);
    expect(s.blindSpots).toBe(1); // B: CSM 5 vs AI 2
    expect(s.needsAction).toBe(1); // only A clears the threshold
    expect(s.needsActionRenewingSoon).toBe(1);
    // Prior month across the rows that carry two months: A was Average, C Good.
    expect(s.atGoodPreviousMonth).toBe(1);
  });

  it('reports no prior month when nothing carries history', () => {
    const s = summarise(triage([makeRow({ history: [] })], NOW));
    expect(s.atGoodPreviousMonth).toBeNull();
  });

  it('counts needsAction against the exported threshold', () => {
    const justUnder = summarise(triage([makeRow({ triageScore: ACTION_THRESHOLD - 1 })], NOW));
    expect(justUnder.needsAction).toBe(0);
    const over = summarise(triage([makeRow({ triageScore: ACTION_THRESHOLD })], NOW));
    expect(over.needsAction).toBe(1);
    expect(triage([makeRow({ triageScore: ACTION_THRESHOLD })], NOW)[0].score)
      .toBeGreaterThanOrEqual(ACTION_THRESHOLD);
  });
});

describe('triageDrillSets', () => {
  // Fix round 1: TriageTiles used to re-filter `scored` itself for its
  // drills, duplicating these three predicates outside of triage.ts. This
  // pins that `summarise`'s counts and `triageDrillSets`' row sets are the
  // same predicates, so the two can never drift apart.
  const rows = [
    makeRow({
      id: '1',
      account: 'A',
      healthStatus: 'Poor',
      triageScore: 66,
      triageDirection: 'declining',
    }),
    makeRow({
      id: '2',
      account: 'B',
      healthStatus: 'Good',
      csmPulseScore: 5,
      aiPulseScore: 2,
      triageScore: 0,
    }),
    makeRow({ id: '3', account: 'C', healthStatus: 'Good', triageScore: 0, triageDirection: 'flat' }),
  ];
  const scored = triage(rows, NOW);

  it('returns exactly the rows behind each of summarise’s counts', () => {
    const sets = triageDrillSets(scored);

    expect(sets.needsAction.map((t) => t.row.account)).toEqual(['A']);
    expect(sets.declining.map((t) => t.row.account)).toEqual(['A']);
    expect(sets.atGood.map((t) => t.row.account).sort()).toEqual(['B', 'C']);
  });

  it('agrees numerically with summarise for the same book', () => {
    const sets = triageDrillSets(scored);
    const summary = summarise(scored);

    expect(sets.needsAction.length).toBe(summary.needsAction);
    expect(sets.declining.length).toBe(summary.declining);
    expect(sets.atGood.length).toBe(summary.atGood);
  });
});

describe('overdue renewals', () => {
  // Real books carry renewal dates in the past. `daysToRenewal` has always
  // handled them (see the `daysToRenewal` suite above); this pins that a
  // negative day count still flows through scoreRow onto the drill detail
  // without upsetting the (now server-driven) score.
  it('carries a negative daysToRenewal through scoreRow without throwing', () => {
    const overdue = scoreRow(makeRow({ renewalDate: 'Jan 1, 2026', triageScore: 40 }), NOW); // 165d ago
    expect(overdue.daysToRenewal).toBeLessThan(0);
    expect(overdue.score).toBe(40);
  });
});

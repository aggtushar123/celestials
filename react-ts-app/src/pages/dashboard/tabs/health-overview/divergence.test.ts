import { describe, it, expect } from 'vitest';
import { healthRow } from './testUtils';
import {
  DIVERGENCE_THRESHOLD,
  kindOf,
  layOut,
  quadrantOf,
  splitDivergent,
  summariseDivergence,
} from './divergence';

/** Local midnight, matching triage.test.ts, so calendar-day maths is stable. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

const makeRow = healthRow;

describe('kindOf', () => {
  it('treats a one-point difference as agreement', () => {
    // Both scores are integers on a five-point scale; one step apart is
    // rounding, not a disagreement worth surfacing.
    expect(kindOf(makeRow({ csmPulseScore: 4, aiPulseScore: 3 }))).toBe('aligned');
    expect(kindOf(makeRow({ csmPulseScore: 3, aiPulseScore: 4 }))).toBe('aligned');
    expect(kindOf(makeRow({ csmPulseScore: 3, aiPulseScore: 3 }))).toBe('aligned');
  });

  it('names which side is reading colder', () => {
    expect(kindOf(makeRow({ csmPulseScore: 5, aiPulseScore: 2 }))).toBe('ai-colder');
    expect(kindOf(makeRow({ csmPulseScore: 2, aiPulseScore: 5 }))).toBe('csm-colder');
  });

  it('flips exactly at the threshold', () => {
    const atThreshold = makeRow({ csmPulseScore: 3, aiPulseScore: 3 - DIVERGENCE_THRESHOLD });
    const belowIt = makeRow({ csmPulseScore: 3, aiPulseScore: 3 - DIVERGENCE_THRESHOLD + 1 });
    expect(kindOf(atThreshold)).toBe('ai-colder');
    expect(kindOf(belowIt)).toBe('aligned');
  });
});

describe('quadrantOf', () => {
  it('puts a neutral 3 on the cautious side', () => {
    // An account both parties scored 3 is not a healthy one.
    expect(quadrantOf(makeRow({ csmPulseScore: 3, aiPulseScore: 3 }))).toBe('aligned-at-risk');
  });

  it('separates the four states', () => {
    expect(quadrantOf(makeRow({ csmPulseScore: 5, aiPulseScore: 5 }))).toBe('aligned-healthy');
    expect(quadrantOf(makeRow({ csmPulseScore: 1, aiPulseScore: 1 }))).toBe('aligned-at-risk');
    expect(quadrantOf(makeRow({ csmPulseScore: 5, aiPulseScore: 1 }))).toBe('ai-flags');
    expect(quadrantOf(makeRow({ csmPulseScore: 1, aiPulseScore: 5 }))).toBe('csm-flags');
  });
});

describe('layOut', () => {
  it('places a lone account exactly on its scores', () => {
    const [point] = layOut([makeRow({ csmPulseScore: 4, aiPulseScore: 2 })], NOW);
    expect(point.x).toBe(4);
    expect(point.y).toBe(2);
  });

  it('separates accounts that share a score pair', () => {
    // Both pulses are integers 1-5, so without this the whole book collapses
    // onto at most 25 points and co-located accounts are unclickable.
    const rows = Array.from({ length: 11 }, (_, i) =>
      makeRow({ id: String(i), account: `Acme ${i}`, csmPulseScore: 4, aiPulseScore: 5 }),
    );
    const laid = layOut(rows, NOW);
    const positions = new Set(laid.map((d) => `${d.x!.toFixed(4)},${d.y!.toFixed(4)}`));
    expect(positions.size).toBe(rows.length);
  });

  it('keeps spread points close to their true score', () => {
    const rows = Array.from({ length: 9 }, (_, i) =>
      makeRow({ id: String(i), csmPulseScore: 3, aiPulseScore: 3 }),
    );
    layOut(rows, NOW).forEach((d) => {
      expect(Math.abs(d.x! - 3)).toBeLessThan(0.5);
      expect(Math.abs(d.y! - 3)).toBeLessThan(0.5);
    });
  });

  it('is stable across calls, so the chart does not reshuffle on re-render', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      makeRow({ id: String(i), csmPulseScore: 5, aiPulseScore: 4 }),
    );
    expect(layOut(rows, NOW).map((d) => [d.x, d.y]))
      .toEqual(layOut(rows, NOW).map((d) => [d.x, d.y]));
  });

  it('carries the gap, kind, quadrant and renewal through', () => {
    const [point] = layOut(
      [makeRow({ csmPulseScore: 5, aiPulseScore: 2, renewalDate: 'Jul 15, 2026' })],
      NOW,
    );
    expect(point.gap).toBe(3);
    expect(point.kind).toBe('ai-colder');
    expect(point.quadrant).toBe('ai-flags');
    expect(point.daysToRenewal).toBe(30);
  });
});

describe('splitDivergent', () => {
  const rows = [
    makeRow({ id: '1', account: 'Later', csmPulseScore: 5, aiPulseScore: 2, renewalDate: 'Dec 1, 2026' }),
    makeRow({ id: '2', account: 'Sooner', csmPulseScore: 4, aiPulseScore: 2, renewalDate: 'Jul 1, 2026' }),
    makeRow({ id: '3', account: 'Agreed', csmPulseScore: 4, aiPulseScore: 4 }),
    makeRow({ id: '4', account: 'HumanFirst', csmPulseScore: 2, aiPulseScore: 5 }),
  ];

  it('splits by direction and leaves agreeing accounts out', () => {
    const { aiColder, csmColder } = splitDivergent(layOut(rows, NOW));
    expect(aiColder.map((d) => d.row.account)).toEqual(['Sooner', 'Later']);
    expect(csmColder.map((d) => d.row.account)).toEqual(['HumanFirst']);
  });

  it('orders by soonest renewal, not by gap size', () => {
    // "Later" has the bigger gap (3 vs 2) but a year of runway; the smaller
    // gap renewing next month is the call you actually have to make.
    const { aiColder } = splitDivergent(layOut(rows, NOW));
    expect(aiColder[0].row.account).toBe('Sooner');
    expect(aiColder[0].gap!).toBeLessThan(aiColder[1].gap!);
  });

  it('sorts accounts with no parseable renewal date last', () => {
    const { aiColder } = splitDivergent(
      layOut(
        [
          makeRow({ id: '1', account: 'NoDate', csmPulseScore: 5, aiPulseScore: 1, renewalDate: '' }),
          makeRow({ id: '2', account: 'Dated', csmPulseScore: 5, aiPulseScore: 1, renewalDate: 'Aug 1, 2026' }),
        ],
        NOW,
      ),
    );
    expect(aiColder.map((d) => d.row.account)).toEqual(['Dated', 'NoDate']);
  });
});

describe('summariseDivergence', () => {
  it('counts both directions, agreement and the urgent blind spots', () => {
    const laid = layOut(
      [
        makeRow({ id: '1', csmPulseScore: 5, aiPulseScore: 2, renewalDate: 'Jul 1, 2026' }), // urgent
        makeRow({ id: '2', csmPulseScore: 5, aiPulseScore: 2, renewalDate: 'Dec 1, 2026' }), // not urgent
        makeRow({ id: '3', csmPulseScore: 2, aiPulseScore: 5 }),
        makeRow({ id: '4', csmPulseScore: 4, aiPulseScore: 4 }),
        makeRow({ id: '5', csmPulseScore: 3, aiPulseScore: 3 }),
      ],
      NOW,
    );
    const s = summariseDivergence(laid);

    expect(s.total).toBe(5);
    expect(s.aiColder).toBe(2);
    expect(s.csmColder).toBe(1);
    expect(s.disagreeing).toBe(3);
    expect(s.agreeing).toBe(2);
    expect(s.urgentBlindSpots).toBe(1);
  });

  it('assigns every account to exactly one quadrant', () => {
    const laid = layOut(
      [
        makeRow({ id: '1', csmPulseScore: 5, aiPulseScore: 5 }),
        makeRow({ id: '2', csmPulseScore: 1, aiPulseScore: 1 }),
        makeRow({ id: '3', csmPulseScore: 5, aiPulseScore: 1 }),
        makeRow({ id: '4', csmPulseScore: 1, aiPulseScore: 5 }),
      ],
      NOW,
    );
    const s = summariseDivergence(laid);
    expect(Object.values(s.byQuadrant).reduce((a, b) => a + b, 0)).toBe(4);
    expect(s.byQuadrant).toEqual({
      'aligned-healthy': 1,
      'aligned-at-risk': 1,
      'ai-flags': 1,
      'csm-flags': 1,
    });
  });

  it('handles an empty book', () => {
    const s = summariseDivergence(layOut([], NOW));
    expect(s).toMatchObject({ total: 0, disagreeing: 0, agreeing: 0, urgentBlindSpots: 0 });
  });
});

describe('unrated accounts', () => {
  // The backend keeps an unrated pulse null — "nobody has scored this" is a
  // different fact from "both sides scored it the same", and reading the first
  // as the second would quietly inflate how much the team agrees.
  const unratedByCsm = makeRow({ id: '1', account: 'NoCsm', csmPulseScore: null });
  const unratedByAi = makeRow({ id: '2', account: 'NoAi', aiPulseScore: null });

  it('is its own kind, not agreement', () => {
    expect(kindOf(unratedByCsm)).toBe('unrated');
    expect(kindOf(unratedByAi)).toBe('unrated');
  });

  it('has no quadrant and no plot position', () => {
    expect(quadrantOf(unratedByCsm)).toBeNull();
    const [point] = layOut([unratedByCsm], NOW);
    expect(point.x).toBeNull();
    expect(point.y).toBeNull();
    expect(point.gap).toBeNull();
  });

  it('still carries its renewal countdown, so the lists can rank it', () => {
    const [point] = layOut(
      [makeRow({ csmPulseScore: null, renewalDate: 'Jul 15, 2026' })],
      NOW,
    );
    expect(point.daysToRenewal).toBe(30);
  });

  it('appears in neither divergence list', () => {
    const { aiColder, csmColder } = splitDivergent(layOut([unratedByCsm, unratedByAi], NOW));
    expect(aiColder).toEqual([]);
    expect(csmColder).toEqual([]);
  });

  it('is counted apart from the accounts that agree', () => {
    const laid = layOut(
      [
        makeRow({ id: '1', csmPulseScore: 4, aiPulseScore: 4 }),
        unratedByCsm,
        unratedByAi,
      ],
      NOW,
    );
    const s = summariseDivergence(laid);
    expect(s.total).toBe(3);
    expect(s.unrated).toBe(2);
    expect(s.agreeing).toBe(1);
    expect(s.disagreeing).toBe(0);
    // It belongs to no quadrant, so the quadrants only total the rated ones.
    expect(Object.values(s.byQuadrant).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

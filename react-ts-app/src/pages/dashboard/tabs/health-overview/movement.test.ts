import { describe, it, expect } from 'vitest';
import type { HealthDataRow, HealthStatus } from '../../../../features/health/types';
import { buildFlow, monthsOf, moveCounts, movedRows, netMovement, renewalBuckets, renewalMonths } from './movement';
import { healthRow } from './testUtils';

/** Local midnight, matching the other suites, so calendar maths is stable. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

const M = ['Jan 31, 2026', 'Feb 28, 2026', 'Mar 31, 2026', 'Apr 30, 2026'];

function makeRow(
  statuses: (HealthStatus | null)[],
  overrides: Partial<HealthDataRow> = {},
): HealthDataRow {
  return healthRow({
    healthStatus: statuses[statuses.length - 1] ?? 'Good',
    history: statuses
      .map((status, i) => (status ? { month: M[i], status } : null))
      .filter((h): h is { month: string; status: HealthStatus } => h !== null),
    ...overrides,
  });
}

describe('monthsOf', () => {
  it('takes the month list from the account with the most history', () => {
    // At least one seeded row has no history at all; reading the first row
    // would decide there are no months to draw.
    const rows = [makeRow([]), makeRow(['Good', 'Good', 'Average'])];
    expect(monthsOf(rows)).toEqual([M[0], M[1], M[2]]);
  });

  it('returns nothing when no account carries history', () => {
    expect(monthsOf([makeRow([])])).toEqual([]);
  });
});

describe('buildFlow', () => {
  const book = [
    makeRow(['Good', 'Good', 'Average'], { id: '1' }),
    makeRow(['Good', 'Average', 'Poor'], { id: '2' }),
    makeRow(['Average', 'Average', 'Average'], { id: '3' }),
    makeRow(['Poor', 'Average', 'Good'], { id: '4' }),
  ];

  it('counts each month’s states', () => {
    const flow = buildFlow(book);
    expect(flow.months.map((m) => m.counts)).toEqual([
      { Good: 2, Average: 1, Poor: 1 },
      { Good: 1, Average: 3, Poor: 0 },
      { Good: 1, Average: 2, Poor: 1 },
    ]);
  });

  it('produces one fewer step than there are months', () => {
    const flow = buildFlow(book);
    expect(flow.months).toHaveLength(3);
    expect(flow.steps).toHaveLength(2);
  });

  it('tallies transitions between consecutive months', () => {
    const [firstStep] = buildFlow(book).steps;
    const find = (from: HealthStatus, to: HealthStatus) =>
      firstStep.find((t) => t.from === from && t.to === to)?.count ?? 0;

    expect(find('Good', 'Good')).toBe(1);
    expect(find('Good', 'Average')).toBe(1);
    expect(find('Average', 'Average')).toBe(1);
    expect(find('Poor', 'Average')).toBe(1);
  });

  it('labels each transition’s direction along the health ladder', () => {
    const [, secondStep] = buildFlow(book).steps;
    const byPair = Object.fromEntries(secondStep.map((t) => [`${t.from}>${t.to}`, t.direction]));
    expect(byPair['Good>Average']).toBe('declined');
    expect(byPair['Average>Poor']).toBe('declined');
    expect(byPair['Average>Good']).toBe('improved');
    expect(byPair['Average>Average']).toBe('held');
  });

  it('conserves accounts: every step moves the whole tracked book', () => {
    const flow = buildFlow(book);
    flow.steps.forEach((step, i) => {
      const moved = step.reduce((sum, t) => sum + t.count, 0);
      expect(moved).toBe(flow.months[i].total);
    });
  });

  it('honours the window, keeping the most recent months', () => {
    const flow = buildFlow(book, 2);
    expect(flow.months.map((m) => m.label)).toEqual([M[1], M[2]]);
    expect(flow.steps).toHaveLength(1);
  });

  it('matches accounts to months by label, not by position', () => {
    // An account that only reported in the later months must land in those
    // months rather than being shifted to the start of the axis.
    const rows = [
      makeRow(['Good', 'Good', 'Average'], { id: '1' }),
      makeRow([null, null, 'Poor'], { id: '2' }),
    ];
    const flow = buildFlow(rows);
    expect(flow.months[0].counts).toEqual({ Good: 1, Average: 0, Poor: 0 });
    expect(flow.months[2].counts).toEqual({ Good: 0, Average: 1, Poor: 1 });
    // The late arrival has no prior month, so it contributes to no transition.
    expect(flow.steps[0].reduce((s, t) => s + t.count, 0)).toBe(1);
  });

  it('returns an empty flow when nothing has history', () => {
    const flow = buildFlow([makeRow([])]);
    expect(flow).toEqual({ months: [], steps: [], tracked: 0 });
  });
});

describe('netMovement', () => {
  it('counts moves in both directions and nets them', () => {
    const flow = buildFlow([
      makeRow(['Good', 'Average', 'Poor'], { id: '1' }), // two declines
      makeRow(['Poor', 'Average', 'Good'], { id: '2' }), // two improvements
      makeRow(['Good', 'Good', 'Good'], { id: '3' }), // two holds
    ]);
    expect(netMovement(flow)).toEqual({ improved: 2, declined: 2, held: 2, net: 0 });
  });

  it('counts an account that fell and recovered on both sides', () => {
    // Deliberate: "how much did this book move" is not the same question as
    // "where did it end up", and a round trip is real churn.
    const flow = buildFlow([makeRow(['Good', 'Average', 'Good'])]);
    expect(netMovement(flow)).toMatchObject({ improved: 1, declined: 1, net: 0 });
  });
});

describe('movedRows', () => {
  // Movement's own drill: which accounts belong behind the Downgrades /
  // Upgrades tiles. `down` and `up` are unambiguous; `flat` never moves;
  // `roundTrip` moved both ways inside the same window and must appear in
  // both lists; `oneMonth` can't move (fewer than two data points).
  const down = makeRow(['Good', 'Average', 'Poor'], { id: '1', account: 'Down' });
  const up = makeRow(['Poor', 'Average', 'Good'], { id: '2', account: 'Up' });
  const flat = makeRow(['Good', 'Good', 'Good'], { id: '3', account: 'Flat' });
  const roundTrip = makeRow(['Good', 'Average', 'Good'], { id: '4', account: 'RoundTrip' });
  const oneMonth = makeRow(['Good'], { id: '5', account: 'OneMonth' });

  it('returns exactly the accounts with a downgrade, or exactly those with an upgrade, inside the window', () => {
    const book = [down, up, flat, roundTrip, oneMonth];
    expect(movedRows(book, 3, 'declined').map((r) => r.id)).toEqual(['1', '4']);
    expect(movedRows(book, 3, 'improved').map((r) => r.id)).toEqual(['2', '4']);
  });

  it('ignores a move that happened before the window', () => {
    // Poor -> Good happens between the 1st and 2nd month; the last two
    // months (the window) hold steady at Good. A predicate that reads the
    // whole history instead of just the window would wrongly include this.
    const oldUpgrade = makeRow(['Poor', 'Good', 'Good', 'Good'], { id: '6', account: 'OldUpgrade' });
    expect(movedRows([oldUpgrade], 2, 'improved')).toEqual([]);
    expect(movedRows([oldUpgrade], 4, 'improved').map((r) => r.id)).toEqual(['6']);
  });

  it('treats windowMonths <= 0 as the full history, like buildFlow and trajectoryOf do', () => {
    const oldUpgrade = makeRow(['Poor', 'Good', 'Good', 'Good'], { id: '6' });
    expect(movedRows([oldUpgrade], 0, 'improved').map((r) => r.id)).toEqual(['6']);
  });

  it('never throws on a row with fewer than two months of history', () => {
    expect(movedRows([oneMonth, makeRow([], { id: '7' })], 3, 'declined')).toEqual([]);
    expect(movedRows([oneMonth, makeRow([], { id: '7' })], 3, 'improved')).toEqual([]);
  });
});

describe('moveCounts', () => {
  it('counts every drop or rise inside the window, per account', () => {
    // Fix round 1: the tile counts moves, not accounts — an account that
    // drops twice must show 2, not 1.
    const twice = makeRow(['Good', 'Average', 'Poor'], { id: '1' }); // two declines
    const once = makeRow(['Good', 'Average', 'Good'], { id: '2' }); // one decline, one rise
    const never = makeRow(['Good', 'Good', 'Good'], { id: '3' });

    const counts = moveCounts([twice, once, never], 3);
    expect(counts.get('1')).toEqual({ declined: 2, improved: 0 });
    expect(counts.get('2')).toEqual({ declined: 1, improved: 1 });
    expect(counts.get('3')).toEqual({ declined: 0, improved: 0 });
  });

  it('windows by the same canonical month labels buildFlow and netMovement use — not by slicing a row’s own history', () => {
    // A book where one account's history is shorter and offset from the
    // other's, same shape as buildFlow's own "matches accounts to months by
    // label, not by position" test. If `moveCounts` sliced each row's own
    // history positionally instead of aligning by label, this account's
    // two-entry history would be read as its *first* two months rather than
    // its real (later) ones, and the two computations below would disagree.
    const full = makeRow(['Good', 'Good', 'Average'], { id: '1' });
    const lateArrival = {
      ...makeRow(['Good'], { id: '2' }),
      history: [
        { month: M[1], status: 'Average' as const },
        { month: M[2], status: 'Poor' as const },
      ],
    };
    const rows = [full, lateArrival];

    const net = netMovement(buildFlow(rows, 3));
    const counts = moveCounts(rows, 3);
    const summed = [...counts.values()].reduce(
      (sum, c) => ({ declined: sum.declined + c.declined, improved: sum.improved + c.improved }),
      { declined: 0, improved: 0 },
    );

    expect(summed).toEqual({ declined: net.declined, improved: net.improved });
    // Concretely: full declines once (Good -> Average); lateArrival declines
    // once (Average -> Poor, in the months it actually has).
    expect(summed).toEqual({ declined: 2, improved: 0 });
  });

  it('sums to netMovement’s totals across the whole book, for every window the view offers', () => {
    const book = [
      makeRow(['Good', 'Average', 'Poor'], { id: '1' }),
      makeRow(['Poor', 'Average', 'Good'], { id: '2' }),
      makeRow(['Good', 'Average', 'Good'], { id: '3' }),
      makeRow(['Average', 'Average', 'Average'], { id: '4' }),
    ];

    for (const window of [1, 2, 3, 12]) {
      const net = netMovement(buildFlow(book, window));
      const counts = moveCounts(book, window);
      const summed = [...counts.values()].reduce(
        (sum, c) => ({ declined: sum.declined + c.declined, improved: sum.improved + c.improved }),
        { declined: 0, improved: 0 },
      );
      expect(summed).toEqual({ declined: net.declined, improved: net.improved });
    }
  });
});

describe('renewalBuckets', () => {
  const at = (renewalDate: string, healthStatus: HealthStatus = 'Good') =>
    makeRow(['Good'], { renewalDate, healthStatus });

  it('groups accounts by how far out they renew', () => {
    const buckets = renewalBuckets(
      [
        at('Jul 1, 2026'), // 16d
        at('Sep 1, 2026'), // 78d
        at('Oct 1, 2026'), // 108d
        at('Jan 1, 2027'), // 200d
        at('Dec 1, 2027'), // 534d
      ],
      NOW,
    );
    expect(buckets.map((b) => b.total)).toEqual([2, 1, 1, 1]);
  });

  it('puts an already-overdue renewal in the most urgent bucket', () => {
    const buckets = renewalBuckets([at('Jan 1, 2026')], NOW); // in the past
    expect(buckets[0].total).toBe(1);
  });

  it('splits each bucket by current health and counts what is not Good', () => {
    const buckets = renewalBuckets(
      [at('Jul 1, 2026', 'Good'), at('Jul 2, 2026', 'Poor'), at('Jul 3, 2026', 'Average')],
      NOW,
    );
    expect(buckets[0].counts).toEqual({ Good: 1, Average: 1, Poor: 1 });
    expect(buckets[0].atRisk).toBe(2);
  });

  it('skips accounts whose renewal date does not parse', () => {
    const buckets = renewalBuckets([at(''), at('whenever'), at('Jul 1, 2026')], NOW);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(1);
  });

  it('carries the exact accounts behind each bucket-status count — the runway chart’s drill', () => {
    const soonPoor = at('Jul 1, 2026', 'Poor'); // bucket 0
    const soonGood = at('Jul 2, 2026', 'Good'); // bucket 0, near miss: same bucket, other status
    const farPoor = at('Dec 1, 2027', 'Poor'); // bucket 3, near miss: same status, other bucket
    const withIds = [
      { ...soonPoor, id: '1' },
      { ...soonGood, id: '2' },
      { ...farPoor, id: '3' },
    ];
    const buckets = renewalBuckets(withIds, NOW);

    expect(buckets[0].rows.Poor.map((r) => r.id)).toEqual(['1']);
    expect(buckets[0].rows.Good.map((r) => r.id)).toEqual(['2']);
    expect(buckets[0].rows.Average).toEqual([]);
    expect(buckets[3].rows.Poor.map((r) => r.id)).toEqual(['3']);
    // Every bucket's row lists agree with its own counts.
    buckets.forEach((b) => {
      expect(b.rows.Good.length).toBe(b.counts.Good);
      expect(b.rows.Average.length).toBe(b.counts.Average);
      expect(b.rows.Poor.length).toBe(b.counts.Poor);
    });
  });

  it('leaves an unparseable renewal date out of every bucket’s rows', () => {
    const noDate = { ...at('', 'Good'), id: '9' };
    const buckets = renewalBuckets([noDate], NOW);
    buckets.forEach((b) => {
      expect(b.rows.Good).toEqual([]);
      expect(b.rows.Average).toEqual([]);
      expect(b.rows.Poor).toEqual([]);
    });
  });
});

describe('renewalMonths', () => {
  const at = (renewalDate: string, healthStatus: HealthStatus = 'Good') =>
    makeRow(['Good'], { renewalDate, healthStatus });

  it('groups accounts by the calendar month they renew in', () => {
    const months = renewalMonths(
      [at('Jul 1, 2026'), at('Jul 28, 2026'), at('Aug 3, 2026')],
      NOW,
    );
    expect(months.map((m) => [m.label, m.total])).toEqual([
      ['Jul 2026', 2],
      ['Aug 2026', 1],
    ]);
  });

  it('keeps months where nothing renews, rather than closing the gap', () => {
    // A compressed axis makes a quiet stretch look as busy as a crowded one.
    const months = renewalMonths([at('Jul 1, 2026'), at('Oct 1, 2026')], NOW);
    expect(months.map((m) => m.label)).toEqual([
      'Jul 2026',
      'Aug 2026',
      'Sep 2026',
      'Oct 2026',
    ]);
    expect(months[1].total).toBe(0);
    expect(months[2].total).toBe(0);
  });

  it('splits each month by current health', () => {
    const months = renewalMonths(
      [at('Jul 1, 2026', 'Good'), at('Jul 2, 2026', 'Poor'), at('Jul 3, 2026', 'Poor')],
      NOW,
    );
    expect(months[0].counts).toEqual({ Good: 1, Average: 0, Poor: 2 });
  });

  it('carries the exact accounts behind each month × health segment', () => {
    const goodJuly = healthRow({ id: '1', account: 'GoodJuly', renewalDate: 'Jul 1, 2026', healthStatus: 'Good' });
    const poorJuly = healthRow({ id: '2', account: 'PoorJuly', renewalDate: 'Jul 2, 2026', healthStatus: 'Poor' });
    // Near miss: same health status, a different month.
    const poorAugust = healthRow({ id: '3', account: 'PoorAugust', renewalDate: 'Aug 2, 2026', healthStatus: 'Poor' });

    const months = renewalMonths([goodJuly, poorJuly, poorAugust], NOW);
    const july = months.find((m) => m.label === 'Jul 2026')!;

    expect(july.rows.Good.map((r) => r.account)).toEqual(['GoodJuly']);
    expect(july.rows.Poor.map((r) => r.account)).toEqual(['PoorJuly']);
  });

  it('spans a year boundary in order', () => {
    const months = renewalMonths([at('Nov 1, 2026'), at('Feb 1, 2027')], NOW);
    expect(months.map((m) => m.label)).toEqual([
      'Nov 2026',
      'Dec 2026',
      'Jan 2027',
      'Feb 2027',
    ]);
  });

  it('skips accounts whose renewal date does not parse, and returns nothing if none do', () => {
    expect(renewalMonths([at(''), at('whenever')], NOW)).toEqual([]);
    expect(renewalMonths([], NOW)).toEqual([]);
    expect(renewalMonths([at(''), at('Jul 1, 2026')], NOW)).toHaveLength(1);
  });
});

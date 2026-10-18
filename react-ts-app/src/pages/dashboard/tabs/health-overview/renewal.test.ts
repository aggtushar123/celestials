import { describe, it, expect } from 'vitest';
import {
  coverageBands,
  coverageOf,
  ownerLoad,
  quarterColumns,
  renewalDrillSets,
  renewalQueue,
  renewalRows,
  riskOfLoss,
  summarise,
} from './renewal';
import { healthRow } from './testUtils';

// Unit tier: the risk model and the money aggregation are the business
// decisions behind the Renewal tab, so they're tested on fixtures rather than
// on generated data.

/** Local midnight, matching the other suites, so calendar maths is stable. */
const NOW = new Date(2026, 5, 15); // 15 Jun 2026

/** A row renewing `days` from NOW. */
const renewingIn = (days: number, overrides = {}) => {
  const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days);
  const label = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return healthRow({ renewalDate: label, ...overrides });
};

describe('coverageOf', () => {
  it('grades contact age, and keeps "never logged" distinct from "long ago"', () => {
    // An account with no activity at all isn't the same as one with an old
    // one: the first may be new, the second is being neglected.
    expect(coverageOf(healthRow({ daysSinceTouch: 3 }))).toBe('fresh');
    expect(coverageOf(healthRow({ daysSinceTouch: 45 }))).toBe('ageing');
    expect(coverageOf(healthRow({ daysSinceTouch: 120 }))).toBe('cold');
    expect(coverageOf(healthRow({ daysSinceTouch: null }))).toBe('unknown');
  });

  it('puts the thresholds on the inclusive side', () => {
    expect(coverageOf(healthRow({ daysSinceTouch: 30 }))).toBe('fresh');
    expect(coverageOf(healthRow({ daysSinceTouch: 60 }))).toBe('ageing');
    expect(coverageOf(healthRow({ daysSinceTouch: 61 }))).toBe('cold');
  });
});

describe('riskOfLoss', () => {
  // The rule itself is the backend's (services/customers/churn.py) and is
  // tested there. What matters here is that this tab reads what it is served
  // rather than deriving a second opinion — the bug that version would cause
  // is the Renewal tab and the Revenue Forecast disagreeing about one account.

  it('reads the risk the backend sent', () => {
    const { risk } = riskOfLoss(healthRow({ riskOfLoss: 0.6, healthStatus: 'Good' }));

    expect(risk).toBe(0.6);
  });

  it('does not re-derive from health, which would drift from the rule', () => {
    // A Poor account the backend scored gently stays gently scored here.
    const { risk } = riskOfLoss(healthRow({ healthStatus: 'Poor', riskOfLoss: 0.05 }));

    expect(risk).toBe(0.05);
  });

  it('passes the reasons through for the row to print', () => {
    const factors = [
      { label: 'Poor health', points: 0.5 },
      { label: 'No contact in 95 days', points: 0.1 },
    ];

    expect(riskOfLoss(healthRow({ riskOfLoss: 0.6, riskFactors: factors })).factors).toEqual(
      factors
    );
  });
});

describe('renewalRows', () => {
  it('counts accounts with no renewal date rather than sorting them to the end', () => {
    const { rows, withoutDate } = renewalRows(
      [renewingIn(10), healthRow({ id: '2', renewalDate: '' })],
      NOW
    );

    expect(rows).toHaveLength(1);
    expect(withoutDate).toBe(1);
  });

  it('multiplies ARR by risk to get exposure', () => {
    const [item] = renewalRows(
      [renewingIn(10, { arr: 200_000, healthStatus: 'Poor', riskOfLoss: 0.5 })],
      NOW
    ).rows;

    expect(item.exposure).toBeCloseTo(200_000 * 0.5);
  });

  it('leaves exposure null when the ARR could not be converted', () => {
    // Not zero: the contract has a value, we just can't state it in this
    // currency, and a zero would quietly shrink every total it lands in.
    const [item] = renewalRows([renewingIn(10, { arr: null })], NOW).rows;

    expect(item.exposure).toBeNull();
  });
});

describe('summarise', () => {
  const book = () =>
    renewalRows(
      [
        renewingIn(10, {
          id: '1',
          arr: 100_000,
          healthStatus: 'Poor',
          daysSinceTouch: 90,
          riskOfLoss: 0.6,
        }),
        renewingIn(80, {
          id: '2',
          arr: 50_000,
          healthStatus: 'Good',
          daysSinceTouch: 5,
          riskOfLoss: 0.05,
        }),
        renewingIn(200, { id: '3', arr: 900_000, healthStatus: 'Poor', riskOfLoss: 0.5 }),
        renewingIn(-12, { id: '4', arr: 30_000 }),
        renewingIn(20, { id: '5', arr: null }),
      ],
      NOW
    ).rows;

  it('counts only the headline window, not the whole book', () => {
    const summary = summarise(book());

    // Rows 1, 2 and 5 — row 3 renews beyond 90 days, row 4 is overdue.
    expect(summary.count).toBe(3);
    expect(summary.arr).toBe(150_000);
  });

  it('excludes an unpriced row from the money but still counts it', () => {
    const summary = summarise(book());

    expect(summary.unpriced).toBe(1);
    expect(summary.arr).toBe(150_000);
  });

  it('reports overdue renewals separately rather than as due now', () => {
    const summary = summarise(book());

    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueArr).toBe(30_000);
    // And the overdue row is not in the window's own figures.
    expect(summary.count).toBe(3);
  });

  it('flags the money renewing soon with nobody talking to it', () => {
    const summary = summarise(book());

    expect(summary.coldCount).toBe(1);
    expect(summary.coldArr).toBe(100_000);
  });

  it('weights exposure by risk rather than calling the whole window at risk', () => {
    const summary = summarise(book());

    // 100k at the 0.6 the backend sent, 50k at 0.05.
    expect(summary.exposure).toBeCloseTo(100_000 * 0.6 + 50_000 * 0.05);
    expect(summary.exposure).toBeLessThan(summary.arr);
  });
});

describe('quarterColumns', () => {
  it('runs continuously from the current quarter, empty quarters included', () => {
    const { rows } = renewalRows([renewingIn(200, { arr: 10_000 })], NOW);

    const columns = quarterColumns(rows, NOW, 4);

    expect(columns.map((c) => c.label)).toEqual(["Q2 '26", "Q3 '26", "Q4 '26", "Q1 '27"]);
  });

  it('splits a quarter by the health of what renews in it', () => {
    const { rows } = renewalRows(
      [
        renewingIn(5, { id: '1', arr: 80_000, healthStatus: 'Poor' }),
        renewingIn(6, { id: '2', arr: 20_000, healthStatus: 'Good' }),
      ],
      NOW
    );

    const [current] = quarterColumns(rows, NOW, 4);

    expect(current.arr.Poor).toBe(80_000);
    expect(current.arr.Good).toBe(20_000);
    expect(current.total).toBe(100_000);
    expect(current.count).toBe(2);
  });

  it('keeps overdue renewals out of the forecast', () => {
    // Hanging a missed date off the current quarter inflates a number people
    // commit to in a forecast review.
    const { rows } = renewalRows([renewingIn(-30, { arr: 500_000 })], NOW);

    expect(quarterColumns(rows, NOW, 4).every((c) => c.total === 0)).toBe(true);
  });

  it('carries the exact accounts behind each quarter × health segment', () => {
    // Near misses: a different quarter, and a different health status within
    // the same quarter — neither should land in the drilled segment.
    const { rows } = renewalRows(
      [
        renewingIn(5, { id: 'poor-now', account: 'PoorNow', arr: 80_000, healthStatus: 'Poor' }),
        renewingIn(6, { id: 'good-now', account: 'GoodNow', arr: 20_000, healthStatus: 'Good' }),
        renewingIn(200, { id: 'poor-later', account: 'PoorLater', arr: 40_000, healthStatus: 'Poor' }),
        renewingIn(-10, { id: 'overdue', account: 'Overdue', arr: 5_000, healthStatus: 'Poor' }),
      ],
      NOW
    );

    const [current] = quarterColumns(rows, NOW, 4);

    expect(current.rows.Poor.map((r) => r.account)).toEqual(['PoorNow']);
    expect(current.rows.Good.map((r) => r.account)).toEqual(['GoodNow']);
    // Every segment's row count matches the length its own `arr`/`count`
    // figures imply — the two never computed separately.
    expect(current.rows.Poor).toHaveLength(1);
  });
});

describe('coverageBands', () => {
  it('splits each window by contact age', () => {
    const { rows } = renewalRows(
      [
        renewingIn(10, { id: '1', arr: 10_000, daysSinceTouch: 2 }),
        renewingIn(20, { id: '2', arr: 20_000, daysSinceTouch: 45 }),
        renewingIn(25, { id: '3', arr: 40_000, daysSinceTouch: 200 }),
        renewingIn(70, { id: '4', arr: 5_000, daysSinceTouch: null }),
      ],
      NOW
    );

    const bands = Object.fromEntries(coverageBands(rows).map((b) => [b.key, b]));

    expect(bands['30'].fresh).toBe(10_000);
    expect(bands['30'].ageing).toBe(20_000);
    expect(bands['30'].cold).toBe(40_000);
    expect(bands['30'].count).toBe(3);
    expect(bands['90'].unknown).toBe(5_000);
  });

  it('gives overdue renewals their own band', () => {
    const { rows } = renewalRows([renewingIn(-5, { arr: 1_000 })], NOW);

    const overdue = coverageBands(rows).find((b) => b.key === 'overdue')!;
    expect(overdue.total).toBe(1_000);
  });

  it('carries the exact accounts behind each window × contact-age segment', () => {
    const { rows } = renewalRows(
      [
        renewingIn(10, { id: '1', account: 'FreshSoon', arr: 10_000, daysSinceTouch: 2 }),
        // Near miss: same window, a different contact age.
        renewingIn(20, { id: '2', account: 'ColdSoon', arr: 20_000, daysSinceTouch: 200 }),
        // Near miss: same contact age, a different window.
        renewingIn(70, { id: '3', account: 'ColdLater', arr: 5_000, daysSinceTouch: 200 }),
      ],
      NOW
    );

    const band30 = coverageBands(rows).find((b) => b.key === '30')!;

    expect(band30.rows.fresh.map((r) => r.account)).toEqual(['FreshSoon']);
    expect(band30.rows.cold.map((r) => r.account)).toEqual(['ColdSoon']);
  });
});

describe('ownerLoad', () => {
  it('ranks owners by the ARR they are carrying, heaviest first', () => {
    const { rows } = renewalRows(
      [
        renewingIn(10, { id: '1', owner: 'Ada', ownerKey: 'ada', arr: 300_000 }),
        renewingIn(20, { id: '2', owner: 'Grace', ownerKey: 'grace', arr: 100_000 }),
        renewingIn(30, { id: '3', owner: 'Grace', ownerKey: 'grace', arr: 50_000 }),
      ],
      NOW
    );

    const load = ownerLoad(rows);

    expect(load.map((l) => l.owner)).toEqual(['Ada', 'Grace']);
    expect(load[1].count).toBe(2);
    expect(load[1].arr).toBe(150_000);
    expect(load[1].rows.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('ignores renewals beyond the horizon', () => {
    const { rows } = renewalRows(
      [renewingIn(400, { owner: 'Ada', ownerKey: 'ada', arr: 1_000_000 })],
      NOW
    );

    expect(ownerLoad(rows, 180)).toEqual([]);
  });

  it('keeps two owners with the same name separate when their ownerKey differs', () => {
    // Two CSMs called "Sam Rivera" is an ordinary thing in a real org; keying
    // on the label instead of `ownerKey` would silently merge their books.
    const { rows } = renewalRows(
      [
        renewingIn(10, { id: '1', owner: 'Sam Rivera', ownerKey: 'sam-1', arr: 200_000 }),
        renewingIn(15, { id: '2', owner: 'Sam Rivera', ownerKey: 'sam-2', arr: 50_000 }),
      ],
      NOW
    );

    const load = ownerLoad(rows);

    expect(load).toHaveLength(2);
    const byKey = Object.fromEntries(load.map((l) => [l.ownerKey, l]));
    expect(byKey['sam-1'].arr).toBe(200_000);
    expect(byKey['sam-2'].arr).toBe(50_000);
    expect(byKey['sam-1'].rows.map((r) => r.id)).toEqual(['1']);
    expect(byKey['sam-2'].rows.map((r) => r.id)).toEqual(['2']);
  });
});

describe('renewalDrillSets', () => {
  const book = () =>
    renewalRows(
      [
        renewingIn(10, {
          id: '1',
          account: 'Poor90',
          arr: 100_000,
          healthStatus: 'Poor',
          daysSinceTouch: 90,
          riskOfLoss: 0.6,
        }),
        renewingIn(80, {
          id: '2',
          account: 'Good90',
          arr: 50_000,
          healthStatus: 'Good',
          daysSinceTouch: 5,
          riskOfLoss: 0.05,
        }),
        // Near miss: renews beyond the 90-day horizon.
        renewingIn(200, { id: '3', account: 'Beyond90', arr: 900_000, healthStatus: 'Poor' }),
        // Overdue — behind "Past due", not "Up for renewal".
        renewingIn(-12, { id: '4', account: 'Overdue', arr: 30_000 }),
        // Inside the horizon but unpriced — in "Up for renewal", not
        // "Forecast at risk".
        renewingIn(20, { id: '5', account: 'Unpriced', arr: null }),
      ],
      NOW
    ).rows;

  it('lists accounts inside the headline horizon, dated or not', () => {
    const { upForRenewal } = renewalDrillSets(book());
    expect(upForRenewal.map((r) => r.row.account).sort()).toEqual(
      ['Good90', 'Poor90', 'Unpriced'].sort()
    );
  });

  it('narrows to a convertible ARR for "forecast at risk"', () => {
    const { forecastAtRisk } = renewalDrillSets(book());
    expect(forecastAtRisk.map((r) => r.row.account).sort()).toEqual(['Good90', 'Poor90'].sort());
  });

  it('leaves out an account with nothing at risk, without changing the sum or the unpriced count', () => {
    // A priced account whose weighted exposure is 0 (a $0 contract) adds
    // nothing to the tile, so listing it under "Forecast at risk" would
    // show a row with "$0 at risk".
    const withZero = [
      ...book(),
      ...renewalRows([renewingIn(30, { id: '6', account: 'ZeroArr', arr: 0 })], NOW).rows,
    ];
    const { forecastAtRisk } = renewalDrillSets(withZero);
    expect(forecastAtRisk.map((r) => r.row.account).sort()).toEqual(['Good90', 'Poor90'].sort());

    const before = summarise(book());
    const after = summarise(withZero);
    expect(after.exposure).toBe(before.exposure);
    expect(after.unpriced).toBe(before.unpriced);
  });

  it('narrows to accounts with no recent contact', () => {
    const { noRecentContact } = renewalDrillSets(book());
    expect(noRecentContact.map((r) => r.row.account)).toEqual(['Poor90']);
  });

  it('lists overdue accounts separately from the horizon', () => {
    const { pastDue } = renewalDrillSets(book());
    expect(pastDue.map((r) => r.row.account)).toEqual(['Overdue']);
  });

  it('sums back to the same totals summarise reports', () => {
    const scored = book();
    const drills = renewalDrillSets(scored);
    const summary = summarise(scored);

    expect(drills.upForRenewal).toHaveLength(summary.count);
    expect(drills.noRecentContact).toHaveLength(summary.coldCount);
    expect(drills.pastDue).toHaveLength(summary.overdueCount);
  });
});

describe('renewalQueue', () => {
  it('ranks by expected loss, not by contract size', () => {
    // The biggest contract is not the one most likely to leave.
    const { rows } = renewalRows(
      [
        renewingIn(30, {
          id: 'big-healthy',
          arr: 500_000,
          healthStatus: 'Good',
          riskOfLoss: 0.05,
        }),
        renewingIn(30, { id: 'small-sick', arr: 200_000, healthStatus: 'Poor', riskOfLoss: 0.5 }),
      ],
      NOW
    );

    expect(renewalQueue(rows).map((item) => item.row.id)).toEqual(['small-sick', 'big-healthy']);
  });

  it('puts overdue renewals first whatever they are worth', () => {
    const { rows } = renewalRows(
      [
        renewingIn(30, { id: 'large', arr: 900_000, healthStatus: 'Poor', riskOfLoss: 0.5 }),
        renewingIn(-3, { id: 'overdue', arr: 1_000, healthStatus: 'Good', riskOfLoss: 0.05 }),
      ],
      NOW
    );

    expect(renewalQueue(rows)[0].row.id).toBe('overdue');
  });

  it('keeps an unpriced renewal in the list rather than dropping it', () => {
    // It still needs working; it just can't be ranked by money.
    const { rows } = renewalRows(
      [
        renewingIn(30, { id: 'priced', arr: 10_000, healthStatus: 'Good', riskOfLoss: 0.05 }),
        renewingIn(30, { id: 'unpriced', arr: null, healthStatus: 'Poor', riskOfLoss: 0.5 }),
      ],
      NOW
    );

    const queue = renewalQueue(rows);

    expect(queue.map((item) => item.row.id)).toEqual(['priced', 'unpriced']);
  });

  it('stops at the horizon', () => {
    const { rows } = renewalRows([renewingIn(120, { arr: 10_000 })], NOW);

    expect(renewalQueue(rows)).toHaveLength(0);
    expect(renewalQueue(rows, 180)).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import { healthByOwner, pulseBuckets } from './controls';
import { healthRow } from './testUtils';

const owned = (owner: string, healthStatus: 'Poor' | 'Average' | 'Good', id: string) =>
  healthRow({ id, owner, ownerKey: owner, healthStatus, account: `Co ${id}` });

describe('healthByOwner', () => {
  it('takes its owners from the rows handed in, not from a fixed list', () => {
    // The chart used to map a hard-coded list of four mock names and divide by
    // their row counts, so on the real book every bar computed to zero and the
    // card rendered empty with only its legend showing.
    const rows = healthByOwner([owned('Carl CSM', 'Poor', '1')]);

    expect(rows.map((row) => row.owner)).toEqual(['Carl CSM']);
    expect(rows[0].Poor).toBe(1);
    expect(rows[0].total).toBe(1);
  });

  it('counts accounts rather than reporting a share of each book', () => {
    // One poor account out of one and one out of twenty are the same
    // percentage and very different problems.
    const rows = healthByOwner([
      owned('Solo', 'Poor', '1'),
      ...Array.from({ length: 19 }, (_, index) => owned('Loaded', 'Good', `g${index}`)),
      owned('Loaded', 'Poor', '20'),
    ]);

    const byOwner = Object.fromEntries(rows.map((row) => [row.owner, row]));
    expect(byOwner.Solo.total).toBe(1);
    expect(byOwner.Loaded.total).toBe(20);
    expect(byOwner.Loaded.Poor).toBe(1);
  });

  it('puts the owner carrying the most poor accounts first', () => {
    const rows = healthByOwner([
      owned('Big and healthy', 'Good', '1'),
      owned('Big and healthy', 'Good', '2'),
      owned('Big and healthy', 'Good', '3'),
      owned('Needs help', 'Poor', '4'),
      owned('Needs help', 'Average', '5'),
    ]);

    expect(rows[0].owner).toBe('Needs help');
  });

  it('breaks a tie on poor accounts with average ones, then with book size', () => {
    const rows = healthByOwner([
      owned('One poor only', 'Poor', '1'),
      owned('Poor and average', 'Poor', '2'),
      owned('Poor and average', 'Average', '3'),
      owned('Poor and a big book', 'Poor', '4'),
      owned('Poor and a big book', 'Good', '5'),
      owned('Poor and a big book', 'Good', '6'),
    ]);

    expect(rows.map((row) => row.owner)).toEqual([
      'Poor and average',
      'Poor and a big book',
      'One poor only',
    ]);
  });

  it('orders by name when two owners carry identical books, so the chart is stable', () => {
    const rows = healthByOwner([owned('Zoe', 'Good', '1'), owned('Adam', 'Good', '2')]);

    expect(rows.map((row) => row.owner)).toEqual(['Adam', 'Zoe']);
  });

  it('returns nothing for an empty book rather than a row of zeroes', () => {
    expect(healthByOwner([])).toEqual([]);
  });

  it('carries the exact accounts behind each owner × health segment', () => {
    const rows = healthByOwner([
      owned('Carl CSM', 'Poor', '1'),
      owned('Carl CSM', 'Good', '2'),
    ]);

    expect(rows[0].rows.Poor.map((r) => r.id)).toEqual(['1']);
    expect(rows[0].rows.Good.map((r) => r.id)).toEqual(['2']);
  });

  it('keeps two owners with the same name separate when their ownerKey differs', () => {
    // Two CSMs called the same thing is ordinary in a real org; grouping by
    // the label instead of `ownerKey` would silently merge their books.
    const rows = healthByOwner([
      healthRow({ id: '1', owner: 'Sam Rivera', ownerKey: 'sam-1', healthStatus: 'Poor' }),
      healthRow({ id: '2', owner: 'Sam Rivera', ownerKey: 'sam-2', healthStatus: 'Good' }),
    ]);

    expect(rows).toHaveLength(2);
    const byKey = Object.fromEntries(rows.map((r) => [r.ownerKey, r]));
    expect(byKey['sam-1'].total).toBe(1);
    expect(byKey['sam-1'].Poor).toBe(1);
    expect(byKey['sam-2'].total).toBe(1);
    expect(byKey['sam-2'].Good).toBe(1);
  });
});

describe('pulseBuckets', () => {
  it('buckets accounts by score and current health', () => {
    const rows = [
      healthRow({ id: '1', csmPulseScore: 3, healthStatus: 'Average' }),
      healthRow({ id: '2', csmPulseScore: 3, healthStatus: 'Poor' }),
      // Near miss: a different score.
      healthRow({ id: '3', csmPulseScore: 4, healthStatus: 'Average' }),
    ];

    const buckets = pulseBuckets(rows, 'csmPulseScore');
    const three = buckets.find((b) => b.score === 3)!;

    expect(three.counts.Average).toBe(1);
    expect(three.counts.Poor).toBe(1);
    expect(three.total).toBe(2);
    expect(three.rows.Average.map((r) => r.id)).toEqual(['1']);
    expect(three.rows.Poor.map((r) => r.id)).toEqual(['2']);
  });

  it('reads the field it is asked for, not a fixed one', () => {
    const rows = [healthRow({ id: '1', csmPulseScore: 1, aiPulseScore: 5, healthStatus: 'Good' })];

    expect(pulseBuckets(rows, 'aiPulseScore').find((b) => b.score === 5)?.total).toBe(1);
    expect(pulseBuckets(rows, 'aiPulseScore').find((b) => b.score === 1)?.total).toBe(0);
  });

  it('puts an unrated account in no bucket rather than the lowest one', () => {
    const rows = [healthRow({ id: '1', csmPulseScore: null })];

    const buckets = pulseBuckets(rows, 'csmPulseScore');
    expect(buckets.every((b) => b.total === 0)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  changeText,
  driverFilter,
  emptyTitle,
  graphHref,
  handoverText,
  hiddenText,
  metricTiles,
  nothingMoved,
  SAY,
  sinceLine,
  toneOf,
  valueText,
  writtenLine,
} from './brainText';
import type { ScopeBrief } from './brainTypes';
import { TILE_METRICS } from './testBrainFixtures';

const BRIEF: ScopeBrief = {
  id: 9, scope: 'team', as_of: '2026-10-05', baseline: '2026-09-30', headline: 'h', body: 'b', watch: [],
  generated_at: '2026-10-05T09:12:00Z', generated_by: 'Alice Admin', stale: false,
};

describe('brain display text', () => {
  it('says what the moves are compared with (spec §2.3 item 1)', () => {
    expect(sinceLine({ since: '2026-09-30', since_kind: 'month_end', team_changed_on: null })).toBe('Since 30 Sep month-end');
    expect(sinceLine({ since: '2026-10-05', since_kind: 'baseline', team_changed_on: null })).toBe('Since 5 Oct, when your view started');
    expect(sinceLine({ since: '2026-10-12', since_kind: 'baseline', team_changed_on: '2026-10-12' })).toBe('Your team changed on 12 Oct; moves start from then');
    expect(sinceLine({ since: null, since_kind: 'month_end', team_changed_on: null })).toBe(SAY.NO_MONTH_END);
  });

  it('says nothing moved since the day compared with, or that nothing can be compared yet', () => {
    expect(nothingMoved('2026-09-30')).toBe('Nothing moved materially since 30 Sep.');
    expect(nothingMoved(null)).toBe('Nothing to compare yet.');
  });

  it('writes a value in its unit, and null as Not measured', () => {
    expect(valueText('money', 114540, 'USD')).toBe('$114.5K');
    expect(valueText('percent', 104, 'USD')).toBe('104%');
    expect(valueText('count', 12.4, 'USD')).toBe('12');
    expect(valueText('money', null, 'USD')).toBe('Not measured');
  });

  it('writes a change with a direction word, never only a sign (spec §2.3 item 3)', () => {
    expect(changeText('money', 50450, 'USD')).toBe('up $50.5K');
    expect(changeText('money', -13400, 'USD')).toBe('down $13.4K');
    expect(changeText('percent', -4, 'USD')).toBe('down 4 pts');
    expect(changeText('percent', 1, 'USD')).toBe('up 1 pt');
    expect(changeText('count', 0, 'USD')).toBe('unchanged');
    expect(changeText('money', null, 'USD')).toBe('Not compared');
  });

  it('reads good or bad news from the direction that is better, or from the server', () => {
    expect([toneOf('down', 50450), toneOf('up', 12000), toneOf('up', -4)]).toEqual(['bad', 'good', 'bad']);
    expect([toneOf('none', 5), toneOf('up', 0), toneOf('up', null)]).toEqual(['neutral', 'neutral', 'neutral']);
    expect([toneOf('up', 5, false), toneOf('down', 5, true), toneOf('none', 5, null)]).toEqual(['bad', 'good', 'neutral']);
  });

  it('says how many customers changed hands, and with whom (Decision 9)', () => {
    expect(handoverText({ in: 0, out: 2, people: ['Dana CSM'] })).toBe('includes 2 customers handed to Dana CSM');
    expect(handoverText({ in: 1, out: 0, people: ['Dana CSM'] })).toBe('includes 1 customer taken over from Dana CSM');
    expect(handoverText({ in: 1, out: 2, people: ['Dana CSM', 'Eli CSM'] })).toBe('includes 1 customer taken over and 2 customers handed to Dana CSM and Eli CSM');
    expect(handoverText({ in: 0, out: 1, people: [] })).toBe('includes 1 customer handed on');
    expect(handoverText({ in: 0, out: 0, people: [] })).toBeNull();
    expect(handoverText(undefined)).toBeNull();
  });

  it('says who wrote a brief, when, and for which view', () => {
    expect(writtenLine(BRIEF, 'My team')).toBe('Written 5 Oct by Alice Admin for My team');
    expect(writtenLine({ ...BRIEF, generated_by: null }, 'Me')).toBe('Written 5 Oct for Me');
  });

  it('counts the organizations the reader cannot open', () => {
    expect([hiddenText(0), hiddenText(1), hiddenText(2)]).toEqual([null, "1 more organization you can't open", "2 more organizations you can't open"]);
  });

  it('words an empty view by whose book it is (Decision 7)', () => {
    expect(emptyTitle('me')).toBe("You don't own any customers yet");
    expect(emptyTitle('team')).toBe("Your team doesn't own any customers yet");
  });
});

describe('graph links (customers Decision 5, Contract note 9)', () => {
  it('opens the graph in a scope, on the owner or product a driver names', () => {
    expect(graphHref('me')).toBe('/brain/graph?scope=me');
    expect(graphHref('company', driverFilter({ dimension: 'product', member: '4' }))).toBe('/brain/graph?scope=company&product=product%3A4');
    expect(graphHref('team', driverFilter({ dimension: 'owner', member: '5' }))).toBe('/brain/graph?scope=team&owner=owner%3A5');
  });

  it('has no node for any other driver', () => {
    expect(driverFilter({ dimension: 'segment', member: 'enterprise' })).toBeNull();
    expect(driverFilter({ dimension: 'lifecycle', member: 'onboarding' })).toBeNull();
  });

  it('has no node for the backend’s non-id owner/product cuts (final review #1)', () => {
    expect(driverFilter({ dimension: 'owner', member: 'unassigned' })).toBeNull();
    expect(driverFilter({ dimension: 'product', member: 'none' })).toBeNull();
  });
});

describe('metricTiles (brain UI spec §2, What changed)', () => {
  it('takes ARR, NRR, ARR at risk and the healthy share by registry key, in that order', () => {
    expect(metricTiles(TILE_METRICS, 'USD').map((tile) => tile.key)).toEqual(['active_arr', 'nrr', 'at_risk_arr', 'healthy_share']);
  });

  it('skips a key the scope does not have', () => {
    const noNrr = TILE_METRICS.filter((m) => m.key !== 'nrr');
    expect(metricTiles(noNrr, 'USD').map((tile) => tile.key)).toEqual(['active_arr', 'at_risk_arr', 'healthy_share']);
  });

  it('gives the figure now, the change, and whether that is better or worse, read from `better`', () => {
    const [arr, , atRisk, healthy] = metricTiles(TILE_METRICS, 'USD');
    expect(arr).toEqual({ key: 'active_arr', label: 'ARR', figure: '$688.6K', change: { text: 'down $13.4K, worse', tone: 'bad' } });
    expect(atRisk.change).toEqual({ text: 'up $50.5K, worse', tone: 'bad' });
    expect(healthy).toMatchObject({ figure: '62%', change: { text: 'up 2 pts, better', tone: 'good' } });
  });

  it('withholds what the server withheld: no figure, no change', () => {
    expect(metricTiles(TILE_METRICS, 'USD')[1]).toEqual({ key: 'nrr', label: 'Net revenue retention', figure: null, change: null });
  });

  it('says "Not compared" with nothing then, and "unchanged" with no move, with no direction word', () => {
    const arr = TILE_METRICS.find((m) => m.key === 'active_arr')!;
    const nrr = TILE_METRICS.find((m) => m.key === 'nrr')!;
    const tiles = metricTiles([{ ...arr, then: null, change: null }, { ...nrr, now: 104, then: 104, change: 0 }], 'USD');
    expect(tiles.map((tile) => tile.change)).toEqual([
      { text: 'Not compared', tone: 'neutral' },
      { text: 'unchanged', tone: 'neutral' },
    ]);
  });
});

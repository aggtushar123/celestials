import { describe, expect, it } from 'vitest';
import type { ListGrid } from './ui';
import { IMPACT_COLUMN_AT_1440_REM, minimumRem, trackRems } from '../test/listGrid';
import { CAMPAIGN_GRID } from './campaigns/campaignGrid';
import { PLAN_GRID } from './plans/planGrid';
import { RULE_GRID } from './rules/ruleGrid';
import { SEGMENT_GRID } from './segments/segmentGrid';
import { SEND_GRID } from './surveys/sendGrid';
import { LOGGED_GRID } from '../pages/surveys/loggedGrid';
import { SCENARIO_GRID } from '../pages/scenarios/scenarioGrid';

const GRIDS: [string, ListGrid][] = [
  ['Segments', SEGMENT_GRID],
  ['Survey sends', SEND_GRID],
  ['Rules', RULE_GRID],
  ['Plans', PLAN_GRID],
  ['Campaigns', CAMPAIGN_GRID],
  ['Logged scores', LOGGED_GRID],
  ['Scenarios', SCENARIO_GRID],
];

describe.each(GRIDS)('the %s list grid (UI foundations spec §4.2)', (_name, grid) => {
  it('restates its template in tracksRem', () => {
    expect(trackRems(grid)).toEqual([...grid.tracksRem]);
  });

  it('fits its container breakpoint: tracks, the gaps between them and the row padding', () => {
    expect(minimumRem(grid)).toBeLessThanOrEqual(grid.breakpointRem);
  });

  it('reaches that breakpoint at 1440, where an Impact list column is 83.5rem', () => {
    expect(IMPACT_COLUMN_AT_1440_REM).toBe(83.5);
    expect(grid.breakpointRem).toBeLessThanOrEqual(IMPACT_COLUMN_AT_1440_REM);
  });

  it('writes the breakpoint into every class, literally, so Tailwind sees it', () => {
    const at = `@min-[${grid.breakpointRem}rem]:`;
    expect(grid.columns.split(' ').every((cls) => cls.startsWith(at))).toBe(true);
    expect(grid.gridAt).toEqual({ row: `${at}grid`, cell: `${at}block` });
    expect(grid.headerShow).toBe(`${at}grid`);
    expect(grid.narrowOnly).toBe(`${at}hidden`);
    expect(grid.gapRem).toBe(0.75);
  });

  it('has a label and an alignment per track', () => {
    expect(grid.labels).toHaveLength(grid.tracksRem.length);
    expect(grid.aligns).toHaveLength(grid.tracksRem.length);
  });
});

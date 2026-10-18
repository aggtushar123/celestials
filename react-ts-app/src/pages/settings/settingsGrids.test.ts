import { describe, expect, it } from 'vitest';
import type { ListGrid } from '../../components/ui';
import { SETTINGS_WIDE_AT_1440_REM, minimumRem, trackRems } from '../../test/listGrid';
import { ATTRIBUTE_GRID } from './attributeGrid';
import { OBJECT_GRID } from './objectGrid';

const GRIDS: [string, ListGrid][] = [
  ['Attributes', ATTRIBUTE_GRID],
  ['Custom objects', OBJECT_GRID],
];

describe.each(GRIDS)('the %s list grid (UI foundations spec §4.2)', (_name, grid) => {
  it('restates its template in tracksRem', () => {
    expect(trackRems(grid)).toEqual([...grid.tracksRem]);
  });

  it('fits its container breakpoint: tracks, the gaps between them and the row padding', () => {
    expect(minimumRem(grid)).toBeLessThanOrEqual(grid.breakpointRem);
  });

  it('reaches that breakpoint at 1440 in the wide settings frame (61rem of content, no Ask rail)', () => {
    expect(SETTINGS_WIDE_AT_1440_REM).toBe(61);
    expect(grid.breakpointRem).toBeLessThanOrEqual(SETTINGS_WIDE_AT_1440_REM);
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

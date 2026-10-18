import { describe, expect, it } from 'vitest';
import { rowAligns, rowColumns, rowLabels } from './rowColumns';

const BREAKPOINT_REM = 62;
/** The column gap in grid mode (`@min-[62rem]:gap-x-2`). */
const GAP_REM = 0.5;

/** The template's smallest width in rem: tracks (a minmax counts its first
 *  value), the grid-mode column gaps, and the row's px-4 padding. */
function minimum(pinned: boolean): number {
  const template = /grid-cols-\[(.+)\]/.exec(rowColumns(pinned))![1];
  const tracks = template.split('_').map((track) => {
    const min = /^minmax\(([\d.]+)rem,/.exec(track);
    if (min) return Number(min[1]);
    const fixed = /^([\d.]+)rem$/.exec(track);
    if (fixed) return Number(fixed[1]);
    if (track.startsWith('minmax(0,')) return 0;
    throw new Error(`unknown track ${track}`);
  });
  return tracks.reduce((a, b) => a + b, 0) + (tracks.length - 1) * GAP_REM + 2;
}

describe('rowColumns', () => {
  it.each([false, true])('fits its container breakpoint with pinned=%s', (pinned) => {
    expect(rowColumns(pinned)).toContain(`@min-[${BREAKPOINT_REM}rem]:grid-cols-`);
    expect(minimum(pinned)).toBeLessThanOrEqual(BREAKPOINT_REM);
  });

  it.each([false, true])('has a label and an alignment per column with pinned=%s', (pinned) => {
    expect(rowAligns(pinned)).toHaveLength(rowLabels(pinned).length);
    expect(rowAligns(pinned)[rowLabels(pinned).indexOf('ARR')]).toBe('right');
  });
});

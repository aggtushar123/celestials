import { describe, expect, it } from 'vitest';
import {
  PIPELINE_ALIGNS,
  PIPELINE_BREAKPOINT_REM,
  PIPELINE_COLUMNS,
  PIPELINE_GAP_REM,
  PIPELINE_GRID_AT,
  PIPELINE_HEADER_SHOW,
  PIPELINE_NARROW_ONLY,
  PIPELINE_TRACKS_REM,
  pipelineLabels,
} from './pipelineColumns';

/** The template's tracks in rem: a minmax counts its first value. */
function tracks(): number[] {
  const template = /grid-cols-\[([^\]]+)\]/.exec(PIPELINE_COLUMNS)![1];
  return template.split('_').map((track) => {
    const min = /^minmax\(([\d.]+)rem,/.exec(track);
    if (min) return Number(min[1]);
    const fixed = /^([\d.]+)rem$/.exec(track);
    if (fixed) return Number(fixed[1]);
    throw new Error(`unknown track ${track}`);
  });
}

describe('the Pipelines row grid', () => {
  it('fits its container breakpoint: tracks, the grid gaps and the row padding', () => {
    expect(tracks()).toEqual([...PIPELINE_TRACKS_REM]);
    const minimum = tracks().reduce((a, b) => a + b, 0) + (tracks().length - 1) * PIPELINE_GAP_REM + 2;
    expect(minimum).toBeLessThanOrEqual(PIPELINE_BREAKPOINT_REM);
  });

  it('writes the breakpoint into every class, literally', () => {
    const at = `@min-[${PIPELINE_BREAKPOINT_REM}rem]:`;
    expect(PIPELINE_COLUMNS.split(' ').every((cls) => cls.startsWith(at))).toBe(true);
    expect(PIPELINE_GRID_AT).toEqual({ row: `${at}grid`, cell: `${at}block` });
    expect(PIPELINE_HEADER_SHOW).toBe(`${at}grid`);
    expect(PIPELINE_NARROW_ONLY).toBe(`${at}hidden`);
  });

  it('has a label and an alignment per track, MRR right-aligned', () => {
    const labels = pipelineLabels('opportunity');
    expect(labels).toEqual(['Opportunity', 'MRR', 'Stage', 'Priority', 'Department', 'Date', '']);
    expect(PIPELINE_ALIGNS).toHaveLength(labels.length);
    expect(PIPELINE_ALIGNS[labels.indexOf('MRR')]).toBe('right');
  });
});

import { describe, expect, it } from 'vitest';
import { MAIL_COLUMNS, MAIL_TRACKS_REM, QUEUE_BREAKPOINT_REM, QUEUE_COLUMNS, QUEUE_GAP_REM, QUEUE_GRID_AT, QUEUE_HEADER_SHOW, QUEUE_NARROW_ONLY, QUEUE_TRACKS_REM } from './queueColumns';

function tracks(columns: string): number[] {
  const template = /grid-cols-\[([^\]]+)\]/.exec(columns)![1];
  return template.split('_').map((track) => {
    const min = /^minmax\(([\d.]+)rem,/.exec(track);
    if (min) return Number(min[1]);
    const fixed = /^([\d.]+)rem$/.exec(track);
    if (fixed) return Number(fixed[1]);
    throw new Error(`unknown track ${track}`);
  });
}

describe('the Communications row grids', () => {
  it.each([
    ['queue', QUEUE_COLUMNS, QUEUE_TRACKS_REM],
    ['mail', MAIL_COLUMNS, MAIL_TRACKS_REM],
  ] as const)('the %s grid fits its breakpoint: tracks, gaps and the row padding', (_name, columns, expected) => {
    expect(tracks(columns)).toEqual([...expected]);
    const minimum = tracks(columns).reduce((a, b) => a + b, 0) + (tracks(columns).length - 1) * QUEUE_GAP_REM + 2;
    expect(minimum).toBeLessThanOrEqual(QUEUE_BREAKPOINT_REM);
  });

  it('writes the breakpoint into every class, literally', () => {
    const at = `@min-[${QUEUE_BREAKPOINT_REM}rem]:`;
    expect(QUEUE_COLUMNS.startsWith(at) && MAIL_COLUMNS.startsWith(at)).toBe(true);
    expect(QUEUE_GRID_AT).toEqual({ row: `${at}grid`, cell: `${at}block` });
    expect(QUEUE_HEADER_SHOW).toBe(`${at}grid`);
    expect(QUEUE_NARROW_ONLY).toBe(`${at}hidden`);
  });
});

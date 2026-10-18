import { describe, expect, it } from 'vitest';
import { DEAL_BREAKPOINT_REM, DEAL_COLUMNS, DEAL_HEADER_SHOW, DEAL_MIN_REM, DEAL_TRACKS_REM } from './dealColumns';

describe('the deals grid', () => {
  it('switches on only where its tracks, gaps and padding fit', () => {
    expect(DEAL_MIN_REM).toBe(DEAL_TRACKS_REM.reduce((a, b) => a + b, 0) + 1.5 + 2);
    expect(DEAL_BREAKPOINT_REM).toBeGreaterThanOrEqual(DEAL_MIN_REM);
  });

  it('writes the breakpoint into its class names, by container width', () => {
    expect(DEAL_COLUMNS.startsWith(`@min-[${DEAL_BREAKPOINT_REM}rem]:`)).toBe(true);
    expect(DEAL_HEADER_SHOW).toBe(`@min-[${DEAL_BREAKPOINT_REM}rem]:grid`);
    expect(DEAL_COLUMNS).toContain(`minmax(${DEAL_TRACKS_REM[0]}rem,1fr)_${DEAL_TRACKS_REM[1]}rem_${DEAL_TRACKS_REM[2]}rem`);
  });
});

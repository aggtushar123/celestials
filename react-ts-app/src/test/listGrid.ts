import type { ListGrid } from '../components/ui';

// Test-only arithmetic for a list's grid (the Records and Ops reviews: a
// container-query grid needs a summed-minimum test).

/** The grid template's tracks in rem: a minmax counts its first value. */
export function trackRems(grid: ListGrid): number[] {
  const template = /grid-cols-\[([^\]]+)\]/.exec(grid.columns)?.[1];
  if (!template) throw new Error(`no grid template in ${grid.columns}`);
  return template.split('_').map((track) => {
    const min = /^minmax\(([\d.]+)rem,/.exec(track);
    if (min) return Number(min[1]);
    const fixed = /^([\d.]+)rem$/.exec(track);
    if (fixed) return Number(fixed[1]);
    throw new Error(`unknown track ${track}`);
  });
}

/** The narrowest container a row fits: its tracks, the gaps between them
 *  and the row's own px-4 padding (2rem). */
export function minimumRem(grid: ListGrid): number {
  const tracks = trackRems(grid);
  return tracks.reduce((sum, track) => sum + track, 0) + (tracks.length - 1) * grid.gapRem + 2;
}

/** An Impact list's column at 1440: 1440px less the 72px sidebar and the
 *  frame's two 16px gutters (no Impact page has an Ask rail), in rem. */
export const IMPACT_COLUMN_AT_1440_REM = (1440 - 72 - 32) / 16;

/** A wide settings page's content at 1440: the frame's max-w-5xl (64rem)
 *  less its sm:px-6 gutters (3rem). The 1440 viewport less the 72px sidebar
 *  and the 224px settings nav leaves 71.5rem, so the cap is what binds.
 *  No settings page has an Ask rail. */
export const SETTINGS_WIDE_AT_1440_REM = 64 - 3;

/** A default settings page's content: max-w-3xl (48rem) less 3rem. */
export const SETTINGS_DEFAULT_AT_1440_REM = 48 - 3;

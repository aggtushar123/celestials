// The deals list's grid (spec §4.2): name, MRR, then the tags. The last
// track is fixed (not auto) so every row's MRR sits under the MRR heading.
// It switches on by the list card's own width (an @container), not the
// viewport's, because the Ask rail narrows the card; below the breakpoint
// the row stacks as on phones. The class names are written out whole so
// Tailwind can see them; the test keeps them in step with these numbers.
export const DEAL_TRACKS_REM = [12, 7, 15];
/** Tracks, the two gaps (gap-3) and the row's px-4, in rem. */
export const DEAL_MIN_REM = DEAL_TRACKS_REM.reduce((sum, rem) => sum + rem, 0) + 2 * 0.75 + 2;
export const DEAL_BREAKPOINT_REM = 40;
export const DEAL_COLUMNS = '@min-[40rem]:grid-cols-[minmax(12rem,1fr)_7rem_15rem]';
export const DEAL_HEADER_SHOW = '@min-[40rem]:grid';

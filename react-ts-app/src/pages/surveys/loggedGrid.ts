import type { ListGrid } from '../../components/ui';

/** Logged scores: organisation (and account); type; sent; status; score;
 *  the row's actions on hover. */
export const LOGGED_GRID = {
  tracksRem: [14, 4, 7, 6, 4, 8],
  gapRem: 0.75,
  breakpointRem: 52,
  columns: '@min-[52rem]:grid-cols-[minmax(14rem,1fr)_4rem_7rem_6rem_4rem_8rem]',
  gridAt: { row: '@min-[52rem]:grid', cell: '@min-[52rem]:block' },
  headerShow: '@min-[52rem]:grid',
  narrowOnly: '@min-[52rem]:hidden',
  labels: ['Organization', 'Type', 'Sent', 'Status', 'Score', ''],
  aligns: ['left', 'left', 'left', 'left', 'right', 'left'],
} as const satisfies ListGrid;

import type { ListGrid } from '../ui';

/** The Segments list (spec §4.2): name and meta; members; today's moves;
 *  the 30-day size, once the list's @container is 40rem. */
export const SEGMENT_GRID = {
  tracksRem: [14, 6, 6, 5],
  gapRem: 0.75,
  breakpointRem: 40,
  columns: '@min-[40rem]:grid-cols-[minmax(14rem,1fr)_6rem_6rem_5rem]',
  gridAt: { row: '@min-[40rem]:grid', cell: '@min-[40rem]:block' },
  headerShow: '@min-[40rem]:grid',
  narrowOnly: '@min-[40rem]:hidden',
  labels: ['Segment', 'Members', 'Today', '30 days'],
  aligns: ['left', 'right', 'right', 'left'],
} as const satisfies ListGrid;

import type { ListGrid } from '../ui';

/** Rules: name over its sentence; the last night and whose it is; the
 *  owner's switch (or On / Off) with Paused before it. */
export const RULE_GRID = {
  tracksRem: [16, 14, 10],
  gapRem: 0.75,
  breakpointRem: 44,
  columns: '@min-[44rem]:grid-cols-[minmax(16rem,1fr)_14rem_10rem]',
  gridAt: { row: '@min-[44rem]:grid', cell: '@min-[44rem]:block' },
  headerShow: '@min-[44rem]:grid',
  narrowOnly: '@min-[44rem]:hidden',
  labels: ['Rule', 'Last night', 'On or off'],
  aligns: ['left', 'left', 'left'],
} as const satisfies ListGrid;

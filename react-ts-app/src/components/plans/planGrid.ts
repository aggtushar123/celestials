import type { ListGrid } from '../ui';

/** Plans: name over record · kind · owner; milestones; next due; status. */
export const PLAN_GRID = {
  tracksRem: [14, 8, 8, 7],
  gapRem: 0.75,
  breakpointRem: 44,
  columns: '@min-[44rem]:grid-cols-[minmax(14rem,1fr)_8rem_8rem_7rem]',
  gridAt: { row: '@min-[44rem]:grid', cell: '@min-[44rem]:block' },
  headerShow: '@min-[44rem]:grid',
  narrowOnly: '@min-[44rem]:hidden',
  labels: ['Plan', 'Milestones', 'Next due', 'Status'],
  aligns: ['left', 'left', 'left', 'left'],
} as const satisfies ListGrid;

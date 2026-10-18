import type { ListGrid } from '../ui';

/** Campaigns: name over segment · owner; status; the last send. */
export const CAMPAIGN_GRID = {
  tracksRem: [14, 6, 16],
  gapRem: 0.75,
  breakpointRem: 44,
  columns: '@min-[44rem]:grid-cols-[minmax(14rem,1fr)_6rem_16rem]',
  gridAt: { row: '@min-[44rem]:grid', cell: '@min-[44rem]:block' },
  headerShow: '@min-[44rem]:grid',
  narrowOnly: '@min-[44rem]:hidden',
  labels: ['Campaign', 'Status', 'Last send'],
  aligns: ['left', 'left', 'left'],
} as const satisfies ListGrid;

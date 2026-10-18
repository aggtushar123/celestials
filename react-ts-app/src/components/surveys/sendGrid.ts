import type { ListGrid } from '../ui';

/** Survey sends: name and meta; the type; answered of sent; the rate. */
export const SEND_GRID = {
  tracksRem: [14, 5, 8, 5],
  gapRem: 0.75,
  breakpointRem: 40,
  columns: '@min-[40rem]:grid-cols-[minmax(14rem,1fr)_5rem_8rem_5rem]',
  gridAt: { row: '@min-[40rem]:grid', cell: '@min-[40rem]:block' },
  headerShow: '@min-[40rem]:grid',
  narrowOnly: '@min-[40rem]:hidden',
  labels: ['Survey', 'Type', 'Answered', 'Rate'],
  aligns: ['left', 'left', 'right', 'right'],
} as const satisfies ListGrid;

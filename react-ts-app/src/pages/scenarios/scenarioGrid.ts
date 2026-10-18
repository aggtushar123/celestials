import type { ListGrid } from '../../components/ui';

/** The legacy canvas scenarios: name; applies to; nodes; status; updated;
 *  Delete on hover. */
export const SCENARIO_GRID = {
  tracksRem: [14, 9, 4, 6, 8, 3],
  gapRem: 0.75,
  breakpointRem: 52,
  columns: '@min-[52rem]:grid-cols-[minmax(14rem,1fr)_9rem_4rem_6rem_8rem_3rem]',
  gridAt: { row: '@min-[52rem]:grid', cell: '@min-[52rem]:block' },
  headerShow: '@min-[52rem]:grid',
  narrowOnly: '@min-[52rem]:hidden',
  labels: ['Scenario', 'Applies to', 'Nodes', 'Status', 'Updated', ''],
  aligns: ['left', 'left', 'right', 'left', 'left', 'left'],
} as const satisfies ListGrid;

import type { ListGrid } from '../../components/ui';

/** Custom objects: the name (it opens the object); what it applies to; its
 *  fields and records; the row's Delete (one 44px icon button), once the
 *  section's @container is 44rem. Below it the meta line says the rest. */
export const OBJECT_GRID = {
  tracksRem: [12, 11, 5, 6, 2.75],
  gapRem: 0.75,
  breakpointRem: 44,
  columns: '@min-[44rem]:grid-cols-[minmax(12rem,1fr)_11rem_5rem_6rem_2.75rem]',
  gridAt: { row: '@min-[44rem]:grid', cell: '@min-[44rem]:block' },
  headerShow: '@min-[44rem]:grid',
  narrowOnly: '@min-[44rem]:hidden',
  labels: ['Object', 'Applies to', 'Fields', 'Records', ''],
  aligns: ['left', 'left', 'right', 'right', 'right'],
} as const satisfies ListGrid;

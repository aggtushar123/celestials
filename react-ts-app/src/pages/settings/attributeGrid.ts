import type { ListGrid } from '../../components/ui';

/** Attributes (spec §4.2, §9.2 row 4): display name over its API name; the
 *  type; Required (a neutral badge, or nothing); how full it is, once the
 *  section's @container is 40rem. Below it the meta line says all three. */
export const ATTRIBUTE_GRID = {
  tracksRem: [14, 7, 6, 8],
  gapRem: 0.75,
  breakpointRem: 40,
  columns: '@min-[40rem]:grid-cols-[minmax(14rem,1fr)_7rem_6rem_8rem]',
  gridAt: { row: '@min-[40rem]:grid', cell: '@min-[40rem]:block' },
  headerShow: '@min-[40rem]:grid',
  narrowOnly: '@min-[40rem]:hidden',
  labels: ['Attribute', 'Type', 'Required', 'Filled'],
  aligns: ['left', 'left', 'left', 'right'],
} as const satisfies ListGrid;

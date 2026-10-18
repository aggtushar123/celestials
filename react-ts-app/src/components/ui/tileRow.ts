const TILE_COLUMNS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' } as const;
const CONTAINER_COLUMNS = { 2: '@min-[50rem]:grid-cols-2', 3: '@min-[50rem]:grid-cols-3', 4: '@min-[50rem]:grid-cols-4', 5: '@min-[50rem]:grid-cols-5' } as const;

/** A row of tiles (UI foundations spec §4.3): below sm a sideways snap strip
 *  that bleeds to the frame's edge (the page never scrolls sideways), from
 *  sm a grid of two, and `columns` from lg, or, with `within="container"`,
 *  once the nearest `@container` is 50rem wide (pages beside the Ask rail,
 *  which narrows the column, not the window). `items-start`, so each tile
 *  takes its own content's height instead of stretching to the tallest. */
export function tileRow(columns: 2 | 3 | 4 | 5, within: 'viewport' | 'container' = 'viewport'): string {
  const wide = within === 'container' ? CONTAINER_COLUMNS[columns] : TILE_COLUMNS[columns];
  return `-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 ${wide}`;
}

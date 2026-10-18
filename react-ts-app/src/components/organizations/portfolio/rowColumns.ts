// The portfolio row's grid (UI foundations spec §4.2: figures line up down
// the list) once its @container is 62rem wide: the checkbox and ring, the
// name, trend, renewal, pinned fields (only when any are pinned), ARR,
// pulse, signal, then the row's own buttons. The first and last columns
// are fixed (the row's lead cell and button cell have the same widths), so
// the labels' own grid, which holds nothing in them, lines up with the rows.
// Grid mode closes the column gap to 0.5rem (`@min-[62rem]:gap-x-2`), so the
// labels show beside the Ask rail at 1440. Below 62rem the row wraps as it
// always has. Literal strings, so Tailwind sees every class.

const COLUMNS = '@min-[62rem]:grid-cols-[4.5rem_minmax(12rem,1fr)_4rem_7rem_5rem_10rem_8rem_5rem]';
const COLUMNS_PINNED = '@min-[62rem]:grid-cols-[4.5rem_minmax(12rem,1fr)_4rem_7rem_minmax(0,10rem)_5rem_10rem_8rem_5rem]';

export function rowColumns(pinned: boolean): string {
  return pinned ? COLUMNS_PINNED : COLUMNS;
}

/** Which labels sit over right-aligned figures (ARR). */
export function rowAligns(pinned: boolean): ('left' | 'right')[] {
  return rowLabels(pinned).map((label) => (label === 'ARR' ? 'right' : 'left'));
}

/** The column labels above the rows, on the same template. */
export function rowLabels(pinned: boolean): string[] {
  return ['', 'Name', 'Trend', 'Renewal', ...(pinned ? ['Pinned'] : []), 'ARR', 'Pulse', 'Signal', ''];
}

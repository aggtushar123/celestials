// The Communications rows' grids (UI foundations spec §4.2) once the list's
// region (an @container) is 44rem wide: the queue's who (with its icon
// chip), subject, kind and waiting time; the mailbox's who (with its
// initials), subject, labels and date. Below 44rem a row is one flex line
// (ListRow `gridAt`) and its meta line carries the subject. Literal
// strings, so Tailwind sees every class; the test checks the numbers.

export const QUEUE_TRACKS_REM = [14, 12, 7.5, 6] as const;
export const MAIL_TRACKS_REM = [14, 12, 7.5, 5] as const;
/** ListRow's own gap-3. */
export const QUEUE_GAP_REM = 0.75;
export const QUEUE_BREAKPOINT_REM = 44;
export const QUEUE_COLUMNS = '@min-[44rem]:grid-cols-[minmax(14rem,16rem)_minmax(12rem,1fr)_7.5rem_6rem]';
export const MAIL_COLUMNS = '@min-[44rem]:grid-cols-[minmax(14rem,16rem)_minmax(12rem,1fr)_7.5rem_5rem]';
export const QUEUE_GRID_AT = { row: '@min-[44rem]:grid', cell: '@min-[44rem]:block' } as const;
export const QUEUE_HEADER_SHOW = '@min-[44rem]:grid';
/** A meta line's subject, shown only while the columns are not. */
export const QUEUE_NARROW_ONLY = '@min-[44rem]:hidden';

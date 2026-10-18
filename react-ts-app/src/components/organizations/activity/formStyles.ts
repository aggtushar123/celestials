import { FOCUS } from '../portfolio/styles';

// The create forms (task, note, call, survey) that both their own tabs and
// the organization page's "+ Add" sheet show: labels above, errors below,
// 44px controls below sm, the page's 11/13/15 type sizes.

/** A text control: 15px on phones (no zoom on focus), 13px from sm. */
export const CONTROL = `block min-h-11 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-ink-muted disabled:opacity-50 sm:min-h-9 sm:py-1.5 sm:text-[13px] ${FOCUS}`;

/** A file picker: the native control, in the page's type size. */
export const FILE_CONTROL = `block w-full min-w-0 text-[13px] text-ink-muted file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:text-[13px] file:font-semibold file:text-ink sm:file:min-h-9 ${FOCUS}`;

/** A form's failure, under the form. */
export const FORM_ERROR = 'text-[13px] font-semibold text-danger';

/** The form's grid: one column in a narrow container (the sheet, a phone),
 *  two in a wide one. Keyed off the container, never the viewport. */
export const FORM_GRID = 'grid grid-cols-1 gap-3 @xl:grid-cols-2';

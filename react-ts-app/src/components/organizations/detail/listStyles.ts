import { FOCUS } from '../portfolio/styles';

// Class strings the organization page's lists share (People, Deals & risks,
// Files), so an item reads the same on every tab as in the Story stream.

/** One list surface: items divided, no card in a card. */
export const LIST = 'divide-y divide-line-subtle overflow-hidden rounded-xl bg-surface';

/** An item's leading icon or initials. */
export const ROW_ICON = 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-muted';

/** The line under an item's title: the account tag, who and what, at 11px. */
export const META = 'mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted';

/** An icon button at an item's end (⋯, delete): 44px below sm, 36px from sm. */
export const ROW_ACTION = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;

/** An item's title as a button: a 44px target below sm (the line height
 *  centres the title in it), as in the Story. */
export const TITLE_BUTTON = `inline-block min-h-11 max-w-full truncate rounded-sm text-left leading-[2.75rem] hover:underline active:opacity-70 sm:min-h-0 sm:leading-normal ${FOCUS}`;

/** A link, or a link-like button, inside an item. */
export const ITEM_LINK = `inline-flex min-h-11 min-w-0 items-center gap-1 rounded-sm text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`;

/** A section's small uppercase heading (Files, Calls, a day), as the Story's days. */
export const SECTION_HEADING = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';

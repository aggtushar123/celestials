// Shared class strings for the portfolio components. The buttons and the
// focus ring live in components/ui/styles.ts now (UI foundations spec §1);
// these re-exports keep every existing import working until each surface
// PR switches to the ui folder.
import { FOCUS, NUM } from '../../ui/styles';

export { BUTTON, FOCUS, PRIMARY, QUIET } from '../../ui/styles';

/** @deprecated Figures are set in the body font with tabular figures
 *  (UI foundations spec §3, owner decision 2): this is `NUM`, kept so the
 *  existing imports move every figure in one step. IDs and code use `CODE`. */
export const MONO = NUM;

/** A board column header's icon button ("+", Hide): 44px below sm. */
export const COLUMN_ICON_BUTTON = `inline-flex min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle ${FOCUS}`;

/** Phone header (UI broken-things fix 1). Below sm the framed bar's wrappers
 *  dissolve (`display: contents`) so the menu button, the title and the
 *  tools share the first row, and the tab strip takes a full-width second
 *  row of its own. That row scrolls sideways and fades at its right edge, so
 *  a tab past the edge reads as more to scroll to; its end padding lets the
 *  last tab clear the fade once scrolled. sm and up are unchanged. */
export const PHONE_UNWRAP = 'max-sm:contents';
export const PHONE_TABS =
  'max-sm:order-last max-sm:basis-full max-sm:h-11 max-sm:overflow-x-auto max-sm:pr-6 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,var(--color-ink)_calc(100%-24px),transparent)]';

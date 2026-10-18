// The shared class strings (UI foundations spec §1, §3, §5.1). Every
// primitive in this folder and every page take their buttons, inputs,
// overlays and figures from here; nothing else writes them by hand.

export const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

/** The bordered button (toolbars, card actions, Try again). Disabled reads
 *  as faint ink on the surface, not as a see-through button; `aria-disabled`
 *  (a busy button that keeps focus) reads the same on every shared button. */
export const BUTTON = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:bg-surface disabled:text-ink-faint disabled:hover:bg-surface disabled:cursor-not-allowed aria-disabled:bg-surface aria-disabled:text-ink-faint aria-disabled:hover:bg-surface aria-disabled:cursor-not-allowed ${FOCUS}`;

/** The borderless button (Show more, empty-state actions, Back). */
export const QUIET = `inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed aria-disabled:text-ink-faint aria-disabled:hover:bg-transparent aria-disabled:cursor-not-allowed ${FOCUS}`;

/** The monochrome primary, one per form: accent fill, its own text colour.
 *  Written out rather than layered on BUTTON, whose surface fill and ink
 *  text would win in the stylesheet's order. */
export const PRIMARY = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover active:bg-accent-hover disabled:border-line disabled:bg-subtle disabled:text-ink-faint disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-subtle aria-disabled:text-ink-faint aria-disabled:cursor-not-allowed ${FOCUS}`;

/** A destructive action, usually inside a ⋯ menu or a confirm dialog. */
export const DANGER = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-danger-ink hover:bg-danger-dim active:bg-danger-dim disabled:text-ink-faint disabled:hover:bg-surface disabled:cursor-not-allowed aria-disabled:text-ink-faint aria-disabled:hover:bg-surface aria-disabled:cursor-not-allowed ${FOCUS}`;

/** An icon-only button: 44px below sm. Every use carries an aria-label
 *  (checked by the house rules). */
export const ICON_BUTTON = `inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed aria-disabled:text-ink-faint aria-disabled:hover:bg-transparent aria-disabled:cursor-not-allowed ${FOCUS}`;

/** An inline link in a meta line or a sentence: below sm a 44px hit area
 *  centred on the text, drawn by a pseudo-element that takes no room, so a
 *  wrapped meta line keeps its own height. Pair with the link's own type and
 *  colour classes. Inline links in sentences and meta lines fall under the
 *  WCAG 2.5.8 inline exception: where areas overlap (stacked lines) the later
 *  link wins, and a parent that clips (a truncated meta line) may cut the
 *  area; the row itself stays the main tap target. */
export const INLINE_TARGET = 'relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 sm:before:hidden';

/** A native select's frame; `Select` adds the chevron. */
export const SELECT = `min-h-11 sm:min-h-9 w-full appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-[13px] text-ink hover:border-line-strong disabled:bg-subtle disabled:text-ink-faint ${FOCUS}`;

/** A text input's frame: white everywhere, the same disabled tokens as SELECT. */
export const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong disabled:bg-subtle disabled:text-ink-faint ${FOCUS}`;

/** The danger edge on an input or select whose `aria-invalid` is true. A
 *  variant, so it wins over the frame's own `border-line` whatever the
 *  stylesheet order; the control carries the state, never a toggled class. */
export const INVALID = 'aria-[invalid=true]:border-danger';

/** A field's error, under the control it belongs to (with `role="alert"`
 *  and an id the control names in `aria-describedby`). */
export const FIELD_ERROR = 'mt-1 text-[11px] leading-4 text-danger-ink';

/** A form's failure that belongs to no one field, under the form. */
export const FORM_ALERT = 'text-[13px] leading-5 text-danger-ink';

/** A form's or page's success line, the counterpart of FORM_ALERT. */
export const FORM_OK = 'text-[13px] leading-5 text-success-ink';

/** A meta-sized line in danger ink (a warning under a card's budget line):
 *  TYPE.meta's size with its own colour, never TYPE.meta plus a colour. */
export const META_DANGER = 'text-[11px] leading-4 text-danger-ink';

/** A checkbox or radio with its words: the label is the 44px target. */
export const CHOICE = 'flex min-h-11 sm:min-h-9 items-center gap-2 text-[13px] leading-5 text-ink';

/** The box itself, in the accent, with the focus ring. */
export const CHECKBOX = `h-4 w-4 shrink-0 accent-accent ${FOCUS}`;

/** Menus, popovers, sheets and modals. Not a card: the only shadow in the app. */
export const OVERLAY = 'rounded-xl border border-line bg-elevated shadow-lg';

/** Every figure: money, counts, scores, percentages, dates in tables,
 *  durations. The body font's tabular figures, so columns align. Wrap the
 *  figure only, never the phrase or its trailing punctuation. */
export const NUM = 'tabular-nums';

/** Revenact IDs, API keys and prefixes, endpoints, webhook URLs, raw JSON.
 *  Nothing else is set in DM Mono. */
export const CODE = 'font-mono-brand';

// The type scale (UI foundations spec §2): four sizes (11/13/15/22 px), two
// weights (400, 600), each size with a role. Never append a colour to one
// of these strings: two text colours in one class list resolve by the
// stylesheet's order, not by position. Muted body text is `bodyMuted`.

export const TYPE = {
  /** The one in-content page heading; a tile's value (with NUM). */
  display: 'text-[22px] leading-7 font-semibold tracking-tight text-ink',
  /** Top-bar title, card and section titles, modal and empty-state titles. */
  title: 'text-[15px] leading-6 font-semibold text-ink',
  /** Rows, paragraphs, inputs, buttons (buttons add font-semibold). */
  body: 'text-[13px] leading-5 text-ink',
  /** Body text in the muted ink: intros, descriptions, inline labels. */
  bodyMuted: 'text-[13px] leading-5 text-ink-muted',
  /** Row meta lines, captions, helper text, badges, column headers, times. */
  meta: 'text-[11px] leading-4 text-ink-muted',
  /** Only tile labels and the settings nav's group labels. */
  eyebrow: 'text-[11px] leading-4 font-semibold uppercase tracking-wider text-ink-muted',
  /** Form field labels, above the input. Never uppercase. */
  label: 'text-[13px] leading-5 font-semibold text-ink',
} as const;

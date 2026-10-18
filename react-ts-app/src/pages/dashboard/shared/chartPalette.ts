import type { HealthStatus } from '../../../features/health/types';
import type { LegendItem } from './ChartLegend';

// The single source of chart colour for every dashboard tab.
//
// Two roles only: a monochrome scale for anything that isn't a status (ink,
// muted, faint — the same three tones as `text-primary`/`text-secondary`/
// `text-tertiary`), and the three semantic tokens for when a value really is
// a loss, a gain or a caution. Nothing here is a literal colour — every
// value is a CSS custom property so light/dark mode and any future
// palette change apply everywhere at once. `chartPalette.test.ts` scans the
// whole dashboard and health tree for the alternative (a literal colour) and
// fails the build if one shows up.

/** The monochrome/semantic roles every chart in this app draws from. Prefer
 *  `ink`/`muted`/`faint` for anything that is a category rather than a
 *  status — a source, an area, a segment — so danger/success/warning stay
 *  reserved for their one job: loss, gain and caution.
 *
 *  `inkStrong`/`inkSoft`/`gainSoft` exist because some charts need more
 *  distinct values than `ink`/`muted`/`faint` (three tones) can cover
 *  without two categories in the same chart landing on the same colour —
 *  a stacked bar with five statuses, a scatter with six usage bands. Each
 *  is a `color-mix()` of a role colour with the surface it sits on, so it
 *  stays a genuine intermediate step (not a fourth arbitrary hue) and still
 *  resolves correctly in dark mode, where `--bg-surface` flips too. */
export const ROLE = {
  ink: 'var(--text-primary)',
  inkStrong: 'color-mix(in srgb, var(--text-primary) 78%, var(--bg-surface))',
  muted: 'var(--text-secondary)',
  inkSoft: 'color-mix(in srgb, var(--text-primary) 55%, var(--bg-surface))',
  faint: 'var(--text-tertiary)',
  loss: 'var(--danger)',
  gain: 'var(--success)',
  gainSoft: 'color-mix(in srgb, var(--success) 45%, var(--bg-surface))',
  caution: 'var(--warning)',
} as const;

/** For a set of categories with no inherent order or meaning — always paired
 *  with a direct label (axis, legend or on-chart text) rather than relied on
 *  alone, since three greys are not reliably distinguishable by colour. */
export const CATEGORICAL = [ROLE.ink, ROLE.muted, ROLE.faint] as const;

/** Shared `<Tooltip contentStyle>` for every recharts tooltip in the
 *  dashboard. No boxShadow — the translucent-black rgb literals this
 *  replaces were the only non-token colour most of these charts had left;
 *  a border reads as "this is a popover" without needing a shadow. Spread
 *  it and override only what a chart genuinely needs (e.g. `fontSize`). */
export const TOOLTIP_STYLE = {
  borderRadius: '8px',
  border: '1px solid var(--border-default)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  boxShadow: 'none',
} as const;

/** Health status colours, one place instead of the nine files that each
 *  redeclared a `STATUS_COLORS`. */
export const HEALTH_COLORS: Record<HealthStatus, string> = {
  Good: ROLE.gain,
  Average: ROLE.caution,
  Poor: ROLE.loss,
};

/** The key for any chart coloured by health, best first. */
export const HEALTH_LEGEND: LegendItem[] = (['Good', 'Average', 'Poor'] as const).map((label) => ({
  label,
  color: HEALTH_COLORS[label],
}));

/** A horizontal bar list's plot height from its row count, so twelve
 *  categories get room and three do not float in a tall empty card. */
export function barListHeight(rows: number, rowPx = 28, min = 200): number {
  return Math.max(min, rows * rowPx);
}

/** One ring for every donut: spread onto `<Pie {...DONUT}>`. */
export const DONUT = { innerRadius: '58%', outerRadius: '80%' } as const;

/** Shared bar-hover cursor fill, replacing the various one-off translucent
 *  black/white literal fills — all were the same idea (a faint hover wash)
 *  reinvented per chart, and none adapted to light/dark on its own. */
export const CURSOR_FILL = 'var(--bg-subtle)';

/** Recharts needs a numeric domain to render axis ticks, and a hard-coded
 *  maximum silently clips real data. Rounds up to a clean boundary above the
 *  data. Moved here from the three tab-local `chartTheme.ts` files, which
 *  each carried an identical copy. */
export function niceMax(values: number[], fallback = 10): number {
  const peak = Math.max(0, ...values);
  if (peak <= 0) return fallback;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil(peak / magnitude) * magnitude;
}

/** Evenly spaced ticks from 0 to `max`, for the axes that render them. */
export function ticksTo(max: number, count = 4): number[] {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(step * i));
}

/** A percentage of a total, as a rounded string. Returns "0" for an empty
 *  total rather than "NaN", which is what a donut of nothing used to render. */
export function percentOf(value: number, total: number): string {
  if (!total) return '0';
  return ((value / total) * 100).toFixed(0);
}

/** Compact counts, e.g. 2090 → "2.09K".
 *
 * The mock divided by 1000 unconditionally, so 300 rendered as "0.3K" — a
 * longer, less readable way of writing 300. Under a thousand stays plain. */
export function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}K` : String(value);
}

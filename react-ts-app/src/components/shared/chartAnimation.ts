/**
 * One home for a decision every chart on every dashboard makes: series render
 * at their final size immediately, with no grow-in animation.
 *
 * Spread it onto any Recharts series — `<Bar {...STATIC_SERIES} />`.
 *
 * Three reasons, in order of how much they matter:
 *
 * 1. **Every dashboard here re-fetches on a filter change.** Bars growing out
 *    of the axis on each change read as movement in the data when all that
 *    happened is that someone asked a narrower question. On a stacked bar it
 *    is worse: climbing from zero looks like the split itself is shifting.
 * 2. **The charts are comparisons.** The whole job of the ARR-by-product bars
 *    or the health-by-owner stack is one glance across categories, and a
 *    second and a half of that glance being wrong is a second and a half of
 *    reading a chart that does not yet say what it will say.
 * 3. **Recharts drives the growth with `requestAnimationFrame`, which does
 *    not run in a hidden tab.** A chart that mounts in a background tab — a
 *    middle-clicked link, a restored session, a second window, anything
 *    driving the page automatically — freezes a few pixels off the axis and
 *    stays there until the tab is focused. Nothing in the app can know it
 *    happened, and a frozen bar is indistinguishable from a real small number.
 *
 * `OriginBar` reached this conclusion first and on its own ("for consistent
 * pixel rendering"). This is that one line, named, argued, and in a place the
 * next chart can find.
 */
export const STATIC_SERIES = { isAnimationActive: false } as const;

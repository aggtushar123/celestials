// Colours and helpers for the Usage Overview dashboard, keyed by band.
//
// Colour lives here rather than in the payload, the same arrangement the other
// dashboards use — the backend returns names and numbers and has no opinion
// about the theme.
//
// The actual colours and axis helpers live in the dashboard-wide
// `shared/chartPalette.ts` now — re-exported here so every chart in this tab
// keeps importing from `./chartTheme` rather than reaching across tabs.
import { ROLE, niceMax } from '../../shared/chartPalette';

export { niceMax };

/**
 * The utilisation bands, coloured by what they mean commercially rather than
 * by position on a scale: red is money going to waste, green is money working,
 * and ink is the top end — at-capacity and over are ink rather than a warm
 * colour because an account out of room is an *opportunity* with an action
 * attached, not a state to alarm on, and colouring it like a problem would
 * bury the expansion list at the bottom of the screen.
 *
 * `over` is `ROLE.inkSoft` rather than the same full `ROLE.ink` as
 * `at_capacity` — both read as "opportunity", but the scatter that plots
 * every band in one chart (`UsageScatter`) needs the two tell-apart-able,
 * and a legend alone isn't enough when dots overlap.
 */
export const BAND_COLORS: Record<string, string> = {
  dormant: ROLE.loss,
  low: ROLE.caution,
  fair: ROLE.muted,
  healthy: ROLE.gain,
  at_capacity: ROLE.ink,
  over: ROLE.inkSoft,
};

/** Short axis labels. The API's own names carry their range ("Dormant
 *  (<25%)"), which is right in a legend and too long under a bar. */
export const BAND_SHORT: Record<string, string> = {
  dormant: 'Dormant',
  low: 'Low',
  fair: 'Fair',
  healthy: 'Healthy',
  at_capacity: 'At capacity',
  over: 'Over',
};

export const FALLBACK_COLOR = ROLE.faint;

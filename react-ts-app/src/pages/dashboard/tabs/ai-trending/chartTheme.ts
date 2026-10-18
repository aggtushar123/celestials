// Chart colours and axis helpers for the AI Trending Topics dashboard, keyed by
// the display names the API returns.
//
// Colour lives here rather than in the payload, the same arrangement the Ticket
// Overview dashboard uses — see its own chartTheme.ts. Only the mock this
// replaced shipped colours alongside its numbers, which gave the backend an
// opinion about the theme.
//
// The actual colours and axis helpers live in the dashboard-wide
// `shared/chartPalette.ts` now — re-exported here so every chart in this tab
// keeps importing from `./chartTheme` rather than reaching across tabs.
import { ROLE, CATEGORICAL, niceMax, compact, percentOf } from '../../shared/chartPalette';

export { niceMax, compact, percentOf };

/** Interaction types — the source donut. Three systems, three tones, none of
 *  them semantic: an email isn't better or worse than a ticket, so these
 *  deliberately avoid success/danger and use the monochrome scale instead. */
export const SOURCE_COLORS: Record<string, string> = {
  Email: ROLE.ink,
  Call: ROLE.muted,
  Ticket: ROLE.faint,
};

/** Sentiment, which *is* semantic. Shared by the donut and the trend line, so
 *  "negative" is the same red in both. */
export const SENTIMENT_COLORS: Record<string, string> = {
  Positive: ROLE.gain,
  Neutral: ROLE.faint,
  Negative: ROLE.loss,
};

/** The order the trend line stacks its three series in, and the keys it reads
 *  off each point — lower-cased because that's what the API sends as object
 *  keys, unlike the labels above. */
export const SENTIMENT_SERIES = [
  { key: 'positive', label: 'Positive', color: SENTIMENT_COLORS.Positive },
  { key: 'neutral', label: 'Neutral', color: SENTIMENT_COLORS.Neutral },
  { key: 'negative', label: 'Negative', color: SENTIMENT_COLORS.Negative },
] as const;

/** AI Area. Three areas, so three distinct tones rather than a scale — they are
 *  categories, not degrees of anything. */
export const AREA_COLORS: Record<string, string> = {
  'Product & Growth': CATEGORICAL[0],
  'Support & Operations': CATEGORICAL[1],
  'Customer Success': CATEGORICAL[2],
};

/** A neutral for anything the maps above don't recognise — a value added to the
 *  backend's taxonomy before this file catches up should render in grey rather
 *  than vanish. */
export const FALLBACK_COLOR = ROLE.faint;

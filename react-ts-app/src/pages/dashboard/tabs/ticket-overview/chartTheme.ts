// Chart colours for the Ticket Overview dashboard, keyed by the
// display names the API returns.
//
// Colour lives here rather than in the payload because that is what
// every other real-data chart in this app already does — see
// SurveyTrendChart's own LINES and HealthDistribution's category map. Only the
// mock this replaced shipped `fill` alongside its numbers, which meant
// the backend had an opinion about the theme.
//
// Both maps are keyed by label, not by the raw enum value, because
// that's what the charts stack, legend and tooltip by.
//
// The actual colours and axis helpers live in the dashboard-wide
// `shared/chartPalette.ts` now — re-exported here so every chart in this tab
// keeps importing from `./chartTheme` rather than reaching across tabs.
import { ROLE, niceMax, ticksTo } from '../../shared/chartPalette';

export { niceMax, ticksTo };

/** Ticket.Status display labels. Shared by the status donut and the
 * assignee breakdown, which stack the same five states — a second copy
 * would drift the moment one of them changed.
 *
 * `Closed` is `ROLE.gainSoft` rather than `ROLE.faint` — a closed ticket is
 * a mild version of the same good outcome as `Resolved` (`ROLE.gain`), not
 * a fifth neutral tone, and `On Hold` already owns `ROLE.faint`. Every value
 * in this map is distinct, which the assignee stacked bar (all five in one
 * bar, with a legend but no space for five per-segment labels) depends on. */
export const STATUS_COLORS: Record<string, string> = {
  Open: ROLE.ink,
  'In Progress': ROLE.muted,
  'On Hold': ROLE.faint,
  Resolved: ROLE.gain,
  Closed: ROLE.gainSoft,
};

/** The order the assignee chart stacks its segments in — roughly the
 * life of a ticket, so a bar reads left to right as work progressing. */
export const STATUS_ORDER = ['Open', 'In Progress', 'On Hold', 'Resolved', 'Closed'];

/** Ticket.Priority display labels, low to critical. Critical is the same
 * `--danger` token as High rather than a separate darker red — the twice-
 * filter rule this app holds AI features to applies to colour too: a
 * reader tells High and Critical apart from the label, not a second shade
 * of red the palette doesn't otherwise have. */
export const PRIORITY_COLORS: Record<string, string> = {
  Low: ROLE.faint,
  Medium: ROLE.muted,
  High: ROLE.caution,
  Critical: ROLE.loss,
};

/** A neutral for anything the maps don't recognise — a status or
 * priority added to the backend before this file catches up should
 * render in grey rather than vanish. */
export const FALLBACK_COLOR = ROLE.faint;

/** Ticket.Priority: display label -> the machine value `?drill=priority:<value>`
 * needs. The stats rows carry only the label (see `PRIORITY_COLORS` above),
 * so a segment drill has to translate it back — a second copy of the same
 * choice list `services/customers/models.py`'s `Ticket.Priority` defines. */
export const PRIORITY_VALUES: Record<string, string> = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
};

/** Ticket.Status: display label -> the machine value `?drill=status:<value>`
 * needs. Same reasoning as `PRIORITY_VALUES` above. */
export const STATUS_VALUES: Record<string, string> = {
  Open: 'open',
  'In Progress': 'in-progress',
  'On Hold': 'on-hold',
  Resolved: 'resolved',
  Closed: 'closed',
};

/** The sentiment line chart's two series. Negative sentiment is a loss and
 *  positive a gain — the only two things danger/success are for. Each is
 *  named in text beside the chart too, so the colour never carries the
 *  meaning alone. */
export const SENTIMENT_SERIES = {
  positive: { label: 'Positive', color: ROLE.gain },
  negative: { label: 'Negative', color: ROLE.loss },
} as const;

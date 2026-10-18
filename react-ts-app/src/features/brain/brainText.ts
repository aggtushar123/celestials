// What the Brain says (spec §2.3), in one place so tests and pages share it.
import type { CurrencyCode } from '../auth/authSlice';
import { dayMonth } from '../contacts/contactsFormat';
import { formatCompactMoney } from '../customers/formatters';
import type { Better, ChangedMetric, ChangedPayload, Driver, Handover, MetricUnit, ScopeBrief, ScopeKey } from './brainTypes';

export const SAY = {
  TITLE: 'What changed',
  LOST_ACCESS: 'You no longer have access to that view.',
  NOT_MEASURED: 'Not measured',
  NOT_COMPARED: 'Not compared',
  NO_MONTH_END: 'No month-end recorded yet; moves start from the first one',
  NOTHING_TO_COMPARE: 'Nothing to compare yet.',
  EMPTY_DETAIL: 'Their numbers show here once customers are assigned.',
  BRIEF: 'Brief',
  WATCH: 'Watch next',
  STALE_BRIEF: 'The numbers have moved since this brief',
  STALE_EXPLANATION: 'The numbers have moved since this explanation',
  WRITE_MINE: 'Write my brief',
  WRITE_COMPANY: 'Write the company brief',
  WRITE_AGAIN: 'Write again',
  WRITING: 'Writing…',
  CREDITS: 'Uses AI credits.',
  EXPLAIN: 'Explain this',
  EXPLAIN_AGAIN: 'Explain again',
  EXPLAINING: 'Explaining…',
  MOVED: 'What moved',
  MEASURE: 'Everything we measure',
  KNOWLEDGE: 'Company knowledge',
  KNOWLEDGE_GRAPH: 'Knowledge graph',
  TILES: 'Headline figures',
  NO_FIGURE: 'No figure',
  LOAD_SCOPES: 'Could not load your views.',
  LOAD_CHANGED: 'Could not load what changed.',
  LOAD_BRIEF: 'Could not load the brief.',
  LOAD_EXPLANATION: 'Could not load the explanation.',
  WRITE_FAILED: 'Could not write the brief.',
  EXPLAIN_FAILED: 'Could not write the explanation.',
  GRAPH_LOAD: 'Could not load the graph.',
  GRAPH_LOADING: 'Loading the graph',
  GRAPH_EMPTY: 'No customers in this view yet',
  /** Final review #2: a reader without view_all_accounts whose scope holds only
   *  customers they can't open is told so honestly, not "no customers". */
  GRAPH_EMPTY_FILTERED: "No customers you can open in this view.",
  GRAPH_EMPTY_DETAIL: 'The graph draws the customers in this view, who owns them and what they run on.',
} as const;

export type Tone = 'good' | 'bad' | 'neutral';

/** "30 Sep", from a date or a timestamp, in UTC. */
export function dayOf(iso: string): string {
  return dayMonth(iso);
}

export function sinceLine(c: Pick<ChangedPayload, 'since' | 'since_kind' | 'team_changed_on'>): string {
  if (c.team_changed_on) return `Your team changed on ${dayOf(c.team_changed_on)}; moves start from then`;
  if (c.since === null) return SAY.NO_MONTH_END;
  return c.since_kind === 'baseline' ? `Since ${dayOf(c.since)}, when your view started` : `Since ${dayOf(c.since)} month-end`;
}

export function nothingMoved(since: string | null): string {
  return since ? `Nothing moved materially since ${dayOf(since)}.` : SAY.NOTHING_TO_COMPARE;
}

export function valueText(unit: MetricUnit, value: number | null, currency: CurrencyCode): string {
  if (value === null) return SAY.NOT_MEASURED;
  if (unit === 'money') return formatCompactMoney(value, currency);
  if (unit === 'percent') return `${value}%`;
  return String(Math.round(value));
}

/** "up $50.5K", "down 4 pts", "unchanged": the direction is a word, not only a colour. */
export function changeText(unit: MetricUnit, change: number | null, currency: CurrencyCode): string {
  if (change === null) return SAY.NOT_COMPARED;
  if (change === 0) return 'unchanged';
  const size = Math.abs(change);
  const amount = unit === 'percent' ? `${size} ${size === 1 ? 'pt' : 'pts'}` : valueText(unit, size, currency);
  return `${change > 0 ? 'up' : 'down'} ${amount}`;
}

/** Good or bad news. A signal brings the server's `improved`; a plain metric
 *  is read from the direction that is better. */
export function toneOf(better: Better, change: number | null, improved?: boolean | null): Tone {
  if (improved !== undefined) return improved === null ? 'neutral' : improved ? 'good' : 'bad';
  if (change === null || change === 0 || better === 'none') return 'neutral';
  return (better === 'up') === change > 0 ? 'good' : 'bad';
}

function listNames(names: string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const customers = (n: number) => `${n} ${n === 1 ? 'customer' : 'customers'}`;

export function handoverText(h?: Handover): string | null {
  if (!h || (h.in === 0 && h.out === 0)) return null;
  const who = listNames(h.people);
  if (h.out === 0) return `includes ${customers(h.in)} taken over${who ? ` from ${who}` : ''}`;
  const out = `${customers(h.out)} handed ${who ? `to ${who}` : 'on'}`;
  return h.in === 0 ? `includes ${out}` : `includes ${customers(h.in)} taken over and ${out}`;
}

export function writtenLine(brief: Pick<ScopeBrief, 'generated_at' | 'generated_by'>, scopeLabel: string): string {
  return `Written ${dayOf(brief.generated_at)}${brief.generated_by ? ` by ${brief.generated_by}` : ''} for ${scopeLabel}`;
}

export function hiddenText(n: number): string | null {
  return n > 0 ? `${n} more ${n === 1 ? 'organization' : 'organizations'} you can't open` : null;
}

export function emptyTitle(scope: ScopeKey): string {
  return scope === 'team' ? "Your team doesn't own any customers yet" : "You don't own any customers yet";
}

/** A graph filter a link can carry (Contract note 9): one owner's or one product's node. */
export type GraphFilter = { owner: string } | { product: string };

export function driverFilter(driver: Pick<Driver, 'dimension' | 'member'>): GraphFilter | null {
  // Final review #1: the backend's owner/product cuts admit the non-id
  // members "unassigned" and "none" (registry.py `_owner_of`/`_product_of`),
  // which name no node on the graph. Only a numeric member links.
  if (!/^\d+$/.test(driver.member)) return null;
  if (driver.dimension === 'owner') return { owner: `owner:${driver.member}` };
  if (driver.dimension === 'product') return { product: `product:${driver.member}` };
  return null;
}

/** The knowledge graph in a scope (customers Decision 5), optionally on one node. */
export function graphHref(scope: ScopeKey, filter: GraphFilter | null = null): string {
  return `/brain/graph?${new URLSearchParams({ scope, ...filter }).toString()}`;
}

/** graph/'s `hidden` (Contract note 8). */
export function graphHiddenText(n: number | undefined): string | null {
  if (!n) return null;
  return n === 1 ? "1 more customer in this view you can't open" : `${n} more customers in this view you can't open`;
}

/** What changed's tiles (brain UI spec 2026-10-06 §2), by the backend
 *  registry's own keys (services/metrics/registry.py): ARR, NRR, ARR at
 *  risk and the healthy share. The registry has no renewals-due metric, so
 *  there are four. */
export const TILE_KEYS = ['active_arr', 'nrr', 'at_risk_arr', 'healthy_share'] as const;
export type TileKey = (typeof TILE_KEYS)[number];

export interface MetricTile {
  key: TileKey;
  label: string;
  /** Null when the server withheld it: the tile says "No figure". */
  figure: string | null;
  change: { text: string; tone: Tone } | null;
}

/** The tiles in TILE_KEYS order, skipping a key the scope doesn't have. The
 *  change is a sentence ("down $13.4K, worse"): the direction is a word,
 *  never colour alone. */
export function metricTiles(metrics: ChangedMetric[], currency: CurrencyCode): MetricTile[] {
  return TILE_KEYS.flatMap((key): MetricTile[] => {
    const m = metrics.find((one) => one.key === key);
    if (!m) return [];
    if (m.now === null) return [{ key, label: m.label, figure: null, change: null }];
    const tone = toneOf(m.better, m.change);
    const direction = tone === 'good' ? ', better' : tone === 'bad' ? ', worse' : '';
    return [{ key, label: m.label, figure: valueText(m.unit, m.now, currency), change: { text: `${changeText(m.unit, m.change, currency)}${direction}`, tone } }];
  });
}

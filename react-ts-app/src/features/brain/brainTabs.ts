// The Brain bar's tabs (brain UI spec 2026-10-06 §1.1), kept free of React
// so the rules are unit-tested on their own.

export interface BrainTab {
  path: string;
  label: string;
}

/** Waiting on you moved to Work (work in one place §5); kept for Ask history, which may name it. */
export const WAITING_TAB = '/brain/waiting';
export const WAITING_LABEL = 'Waiting on you';

export const BRAIN_TABS: readonly BrainTab[] = [
  { path: '/brain', label: 'What changed' },
  { path: '/brain/doing', label: "What's being done" },
  { path: '/brain/customers', label: 'Customers' },
];

/** Every Brain route wears the Brain bar; `/brainstorm` would not. */
export function isBrainPath(pathname: string): boolean {
  return /^\/brain(\/|$)/.test(pathname);
}

/** The tab a Brain route lights. What changed lights only at /brain itself.
 *  Customers also lights on Feature Requests and Anomalies, which open from
 *  its See all. The Knowledge graph lights none. */
export function brainTabOf(pathname: string): string | null {
  if (/^\/brain\/?$/.test(pathname)) return '/brain';
  if (/^\/brain\/doing\/?$/.test(pathname)) return '/brain/doing';
  if (/^\/brain\/(customers|requests|anomalies)(\/|$)/.test(pathname)) return '/brain/customers';
  return null;
}

/** The query a tab carries: the scope only. `?section=` and the graph's
 *  `?owner=` / `?product=` belong to one page, not to the next one. */
export function tabSearch(search: string): string {
  const scope = new URLSearchParams(search).get('scope');
  return scope ? `?${new URLSearchParams({ scope }).toString()}` : '';
}

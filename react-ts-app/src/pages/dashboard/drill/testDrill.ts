// Shared test doubles for a view's server-drill tests. Extracted once a
// fourth caller (Ticket Overview / AI Trending Topics) needed the same pair
// Forecast, Customer Overview and Activity had each been carrying its own
// copy of — see their own test files for how it plugs in.
import { vi } from 'vitest';

export interface DrillCompanyFixture {
  id: number;
  name: string;
  owner: string | null;
  arr: number | null;
  value: number | null;
}

/** Routes the global `fetch` stub by the `drill=` query param, so the stats
 *  fetch and every drill fetch can each answer differently through one
 *  mock — the same way a real backend would. `main` answers anything with no
 *  `drill=` param; `drillBySegment` answers a specific segment. */
export function mockFetchRouted(main: unknown, drillBySegment: Record<string, unknown>) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url: string) => {
    const match = /drill=([^&]+)/.exec(url);
    const body = match ? drillBySegment[decodeURIComponent(match[1])] : main;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** A `{drill, currency}` response body, shaped like backend PR #61's. */
export function drillResponse(companies: DrillCompanyFixture[], valueLabel: string) {
  return {
    drill: { segment: 'x', value_label: valueLabel, count: companies.length, truncated: false, companies },
    currency: 'USD',
  };
}

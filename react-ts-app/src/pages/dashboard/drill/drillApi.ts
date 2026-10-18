// Server drill source: fetches the accounts behind a number the dashboard
// only shows aggregated (Tickets/Interactions/Forecast/Activity/Overview
// segments too numerous or too heavy to compute client-side — see the
// global constraints doc for the full segment list per view). The response
// shape and request convention (the view's own query string plus
// `drill=<segment>`) is backend PR #61.

import { apiFetch } from '../../../lib/apiClient';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import type { DrillRow } from './types';

interface DrillCompany {
  id: number;
  name: string;
  owner: string | null;
  arr: number | null;
  value: number | null;
}

/** The backend answered with the view's own stats and no `drill` key: it
 *  didn't recognise the segment (it ignores an unknown one rather than
 *  erroring), so there is no list behind this number to show. */
export class UnlistableDrillError extends Error {
  constructor(segment: string) {
    super(`The server has no drill for segment "${segment}".`);
    this.name = 'UnlistableDrillError';
  }
}

interface DrillResponse {
  drill?: {
    segment: string;
    value_label: string;
    count: number;
    truncated: boolean;
    companies: DrillCompany[];
  };
  currency: CurrencyCode;
}

const MONEY_LABELS = new Set(['downside', 'expected expansion']);

// One short line per row, worded for the value_label the backend sent
// (see global-constraints.md: tickets, interactions, downside, expected
// expansion, days since contact, ARR). ARR renders nothing because the
// row already shows ARR as its own right-aligned figure (RowList) — a
// detail line repeating it would be redundant.
export function formatDetail(value: number | null, label: string, currency: CurrencyCode): string {
  if (label === 'ARR') return '';
  if (MONEY_LABELS.has(label)) return `${formatCompactMoney(value, currency)} ${label}`;
  if (label === 'days since contact') {
    return value == null ? 'never contacted' : `${value} days since contact`;
  }
  if (label === 'tickets') return `${value} ticket${value === 1 ? '' : 's'}`;
  if (label === 'interactions') return `${value} interaction${value === 1 ? '' : 's'}`;
  return '';
}

export async function fetchDrill(
  path: string,
  query: string,
  segment: string,
  currency: CurrencyCode,
): Promise<{ rows: DrillRow[]; count: number; truncated: boolean; valueLabel: string }> {
  const response = await apiFetch<DrillResponse>(
    `${path}?${query}${query ? '&' : ''}drill=${encodeURIComponent(segment)}`,
  );
  const { drill } = response;
  if (!drill) throw new UnlistableDrillError(segment);

  return {
    rows: drill.companies.map((company) => ({
      id: String(company.id),
      name: company.name,
      owner: company.owner ?? undefined,
      arr: company.arr,
      detail: formatDetail(company.value, drill.value_label, currency),
    })),
    count: drill.count,
    truncated: drill.truncated,
    valueLabel: drill.value_label,
  };
}

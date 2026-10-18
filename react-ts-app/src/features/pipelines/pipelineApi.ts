// Thin apiFetch wrappers over revenact-backend's Pipelines endpoints.
import { apiFetch } from '../../lib/apiClient';
import { downloadAttachment } from '../files/filesSlice';
import { localDay } from '../organizations/storyDays';
import type { BulkResult } from '../organizations/portfolioTypes';
import type { PipelineBulkRequest, PipelineKindKey, PipelinePage } from './pipelineTypes';

export const pipelinePath = (kind: PipelineKindKey) => `/pipelines/${kind}/`;

export function fetchPipeline(kind: PipelineKindKey, query: string): Promise<PipelinePage> {
  const path = pipelinePath(kind);
  return apiFetch<PipelinePage>(query ? `${path}?${query}` : path);
}

/** Every row of the query as CSV with every field, fetched with the
 *  session's token (the API never exposes a URL a plain link could open).
 *  Named for the viewer's own calendar day, not UTC's. */
export function exportPipeline(kind: PipelineKindKey, query: string, today: Date = new Date()): Promise<void> {
  const path = `${pipelinePath(kind)}export.csv`;
  return downloadAttachment({ download_url: query ? `${path}?${query}` : path, name: `${kind}-${localDay(today)}.csv` });
}

export function bulkUpdatePipeline(kind: PipelineKindKey, body: PipelineBulkRequest): Promise<BulkResult> {
  return apiFetch<BulkResult>(`${pipelinePath(kind)}bulk/`, { method: 'POST', body });
}

/** Where a new opportunity or risk can belong (spec §1 Add): an
 *  organisation or an account the viewer may open. `partOf` names an
 *  account's organisations ('' for an organisation, or an account with none). */
export interface PipelineParentChoice {
  type: 'organisation' | 'account';
  id: number;
  name: string;
  partOf: string;
}

export interface PipelineParentMatches {
  organisations: PipelineParentChoice[];
  accounts: PipelineParentChoice[];
  /** Either search has more matches than its first page. */
  more: boolean;
}

interface NamedPage<T> {
  count: number;
  results: T[];
}

/** The Add picker's search: GET /customers/?search= and GET /accounts/?search=
 *  (each a name substring, first page only, scoped server-side to what the
 *  viewer may open), read together. */
export async function searchPipelineParents(search: string): Promise<PipelineParentMatches> {
  const query = search ? `?${new URLSearchParams({ search }).toString()}` : '';
  const [organisations, accounts] = await Promise.all([
    apiFetch<NamedPage<{ id: number; name: string }>>(`/customers/${query}`),
    apiFetch<NamedPage<{ id: number; name: string; customers?: { name: string }[] }>>(`/accounts/${query}`),
  ]);
  return {
    organisations: organisations.results.map((org) => ({ type: 'organisation', id: org.id, name: org.name, partOf: '' })),
    accounts: accounts.results.map((account) => ({
      type: 'account',
      id: account.id,
      name: account.name,
      partOf: (account.customers ?? []).map((org) => org.name).join(', '),
    })),
    more: organisations.count > organisations.results.length || accounts.count > accounts.results.length,
  };
}

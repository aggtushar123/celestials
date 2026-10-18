// The query the Brain's scoped list reads end in (customers spec §1.5,
// Contract note 1). Kept free of apiClient so the API unit tests can mock it.
import type { ScopeKey } from './brainTypes';

/** "/requests/?status=planned&scope=team": the filter, then the scope; nothing when neither. */
export function withScope(path: string, scope?: ScopeKey, status?: string): string {
  const query = new URLSearchParams();
  if (status && status !== 'all') query.set('status', status);
  if (scope) query.set('scope', scope);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

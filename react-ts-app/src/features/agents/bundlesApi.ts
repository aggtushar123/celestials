// Thin apiFetch wrappers over /agents/bundles/ (agent bundles D1 contract §5, §10.5). No em dash.
import { apiFetch } from '../../lib/apiClient';
import type { Bundle, BundleAnswer, HandlerBody, HistoryFilters, HistoryPayload, PickListName, PickListPayload, RejectReason, RunBody, StepFields, StepSave } from './bundleTypes';

export const fetchBundle = (id: number) => apiFetch<Bundle>(`/agents/bundles/${id}/`);
export const runBundle = (id: number, body: RunBody) => apiFetch<BundleAnswer>(`/agents/bundles/${id}/run/`, { method: 'POST', body });
export const retryStep = (bundleId: number, stepId: number, fields?: StepFields) =>
  apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/steps/${stepId}/retry/`, { method: 'POST', body: fields && Object.keys(fields).length > 0 ? { fields } : {} });
export const saveStep = (bundleId: number, stepId: number, body: StepSave) =>
  apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/steps/${stepId}/`, { method: 'PATCH', body });
/** Guided agent: run the one step asked now, with its edited fields when any. */
export const runStep = (bundleId: number, stepId: number, fields?: StepFields) =>
  apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/steps/${stepId}/run/`, { method: 'POST', body: fields && Object.keys(fields).length > 0 ? { fields } : {} });
/** Guided agent: "Not now" skips every waiting step. */
export const stopBundle = (bundleId: number) => apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/stop/`, { method: 'POST', body: {} });
export const refreshBundle = (id: number) => apiFetch<BundleAnswer>(`/agents/bundles/${id}/refresh/`, { method: 'POST' });
export const rejectBundle = (id: number, reason: RejectReason, note: string) =>
  apiFetch<BundleAnswer>(`/agents/bundles/${id}/reject/`, { method: 'POST', body: note.trim() ? { reason, note } : { reason } });

/** The pick-list query parameters, named once so a backend rename is one edit.
 *  `issueType` narrows Jira priorities to the step's issue type id (backend
 *  #119: `?project=SUP&issue_type=10001`). */
export const OPTION_PARAMS = { project: 'project', issueType: 'issue_type', query: 'query', live: 'live' } as const;

export function fetchStepOptions(bundleId: number, stepId: number, list: PickListName, params: { project?: string; issueType?: string; query?: string; live?: boolean } = {}) {
  const query = new URLSearchParams();
  if (params.project) query.set(OPTION_PARAMS.project, params.project);
  if (params.issueType) query.set(OPTION_PARAMS.issueType, params.issueType);
  if (params.query) query.set(OPTION_PARAMS.query, params.query);
  if (params.live) query.set(OPTION_PARAMS.live, '1');
  const text = query.toString();
  return apiFetch<PickListPayload>(`/agents/bundles/${bundleId}/steps/${stepId}/options/${list}/${text ? `?${text}` : ''}`);
}

export function historyQuery(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.agent) params.set('agent', filters.agent);
  if (filters.step_kind) params.set('step_kind', filters.step_kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const fetchHistory = (filters: HistoryFilters) => apiFetch<HistoryPayload>(`/agents/bundles/history/${historyQuery(filters)}`);

export const setHandler = (bundleId: number, body: HandlerBody) => apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/handler/`, { method: 'PATCH', body });

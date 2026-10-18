// Thin apiFetch wrappers over revenact-backend's /api/v1/brain/ (spec §4).
// Every call names its scope (Contract note 1).
import { ApiError, apiFetch } from '../../lib/apiClient';
import type { GraphPayload } from '../graph/graphTypes';
import type { MetricsPayload, SlicePayload } from '../metrics/metricsSlice';
import type {
  BookInitiativeWrite,
  BriefPayload,
  ChangedPayload,
  CustomersPayload,
  DeskMember,
  DoingInitiative,
  DoingPayload,
  ExplanationPayload,
  InitiativePatch,
  InitiativeWrite,
  ScopeKey,
  ScopesPayload,
  WrittenBrief,
  WrittenExplanation,
} from './brainTypes';

const BASE = '/brain/';
const scoped = (path: string, scope: ScopeKey) => `${BASE}${path}?scope=${scope}`;
const explanationPath = (metric: string) => `explanations/${encodeURIComponent(metric)}/`;

export const fetchScopes = () => apiFetch<ScopesPayload>(`${BASE}scopes/`);
export const fetchChanged = (scope: ScopeKey) => apiFetch<ChangedPayload>(scoped('changed/', scope));
export const fetchBrief = (scope: ScopeKey) => apiFetch<BriefPayload>(scoped('brief/', scope));
/** A real, paid model call: only ever from a click. */
export const writeBrief = (scope: ScopeKey) => apiFetch<WrittenBrief>(scoped('brief/', scope), { method: 'POST' });
export const fetchExplanation = (metric: string, scope: ScopeKey) => apiFetch<ExplanationPayload>(scoped(explanationPath(metric), scope));
/** A real, paid model call: only ever from a click. */
export const writeExplanation = (metric: string, scope: ScopeKey) =>
  apiFetch<WrittenExplanation>(scoped(explanationPath(metric), scope), { method: 'POST' });

// What's being done (Doing spec §3; Contract notes 1, 7–9).
export const fetchDoing = (scope: ScopeKey) => apiFetch<DoingPayload>(scoped('doing/', scope));
/** Me or My team only; Company starts go through createCompanyInitiative. */
export const startInitiative = (scope: Exclude<ScopeKey, 'company'>, body: BookInitiativeWrite) =>
  apiFetch<DoingInitiative>(scoped('initiatives/', scope), { method: 'POST', body });
export const editInitiative = (id: number, patch: InitiativePatch) =>
  apiFetch<DoingInitiative>(`${BASE}initiatives/${id}/`, { method: 'PATCH', body: patch });
/** The existing Company route (view_all_accounts); only the new id is read. */
export const createCompanyInitiative = (body: InitiativeWrite) => apiFetch<{ id: number }>('/metrics/initiatives/', { method: 'POST', body });
/** Every member, with whom they report to (Contract note 4). */
export const fetchMembers = () => apiFetch<DeskMember[]>('/auth/members/');
/** view_all_accounts: the Company form's metrics and cuts. */
export const fetchMetricList = () => apiFetch<MetricsPayload>('/metrics/');
export const fetchMetricCut = (metric: string, dimension: string) => apiFetch<SlicePayload>(`/metrics/${metric}/by/${dimension}/`);

// What customers are saying (customers spec §3; Contract notes 1, 8).
export const fetchCustomers = (scope: ScopeKey) => apiFetch<CustomersPayload>(scoped('customers/', scope));
export const fetchBrainGraph = (scope: ScopeKey) => apiFetch<GraphPayload>(scoped('graph/', scope));

/** 403 SCOPE_NOT_ALLOWED: the reader lost this view (Contract note 3). */
export function isScopeRefusal(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = err.body;
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'SCOPE_NOT_ALLOWED';
}

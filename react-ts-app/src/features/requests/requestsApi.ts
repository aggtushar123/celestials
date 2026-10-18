// Thin apiFetch wrappers over revenact-backend's services/requests.
import { apiFetch } from '../../lib/apiClient';
import type { ScopeKey } from '../brain/brainTypes';
import { withScope } from '../brain/scopeQuery';
import type { FeatureRequestFull, FeatureRequestRow, GatherResult, RequestEvidenceRow, RequestStatus } from './types';

export function fetchRequests(status?: RequestStatus | 'all', scope?: ScopeKey): Promise<FeatureRequestRow[]> {
  return apiFetch<FeatureRequestRow[]>(withScope('/requests/', scope, status));
}

export function fetchRequest(id: number, scope?: ScopeKey): Promise<FeatureRequestFull> {
  return apiFetch<FeatureRequestFull>(withScope(`/requests/${id}/`, scope));
}

export function updateRequest(
  id: number,
  changes: { status?: RequestStatus; owner?: number | null; title?: string; summary?: string }
): Promise<FeatureRequestFull> {
  return apiFetch<FeatureRequestFull>(`/requests/${id}/`, { method: 'PATCH', body: changes });
}

export function gatherRequests(): Promise<GatherResult> {
  return apiFetch<GatherResult>('/requests/gather/', { method: 'POST', body: {} });
}

export function mergeRequest(id: number, into: number): Promise<{ id: number; moved: number }> {
  return apiFetch<{ id: number; moved: number }>(`/requests/${id}/merge/`, { method: 'POST', body: { into } });
}

export function moveEvidence(evidenceId: number, requestId: number): Promise<RequestEvidenceRow> {
  return apiFetch<RequestEvidenceRow>(`/requests/evidence/${evidenceId}/move/`, {
    method: 'POST',
    body: { request: requestId },
  });
}

export function dismissEvidence(evidenceId: number): Promise<{ id: number; dismissed: boolean }> {
  return apiFetch<{ id: number; dismissed: boolean }>(`/requests/evidence/${evidenceId}/dismiss/`, {
    method: 'POST',
    body: {},
  });
}

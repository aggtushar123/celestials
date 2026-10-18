// Thin apiFetch wrappers over revenact-backend's services/anomalies —
// see docs/API_CONTRACTS.md's `anomalies` section.
import { apiFetch } from '../../lib/apiClient';
import type { ScopeKey } from '../brain/brainTypes';
import { withScope } from '../brain/scopeQuery';

export type AnomalyStatus = 'live' | 'acknowledged' | 'resolved';

export interface AnomalyRow {
  id: number;
  title: string;
  summary: string;
  status: AnomalyStatus;
  /** Decimal as a string: the ARR of every company the reader may open that reported it. */
  arr: string;
  companies: number;
  interactions: number;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_by: { id: number; name: string } | null;
}

export interface AnomalyEvidenceRow {
  id: number;
  kind: 'email' | 'ticket' | 'call';
  record_id: number;
  snippet: string;
  occurred_at: string;
  company: { type: 'customer' | 'account'; id: number; name: string };
}

export interface AnomalyDetail extends AnomalyRow {
  companies_hit: { id: number; name: string; arr: string }[];
  evidence: AnomalyEvidenceRow[];
}

export interface DetectResult {
  found: number;
  attached: number;
  detail?: string;
}

export const STATUS_LABELS: Record<AnomalyStatus, string> = {
  live: 'Live',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
};

export function fetchAnomalies(status?: AnomalyStatus | 'all', scope?: ScopeKey): Promise<AnomalyRow[]> {
  return apiFetch<AnomalyRow[]>(withScope('/anomalies/', scope, status));
}

export function fetchAnomaly(id: number, scope?: ScopeKey): Promise<AnomalyDetail> {
  return apiFetch<AnomalyDetail>(withScope(`/anomalies/${id}/`, scope));
}

export function setAnomalyStatus(id: number, status: AnomalyStatus): Promise<AnomalyDetail> {
  return apiFetch<AnomalyDetail>(`/anomalies/${id}/`, { method: 'PATCH', body: { status } });
}

export function detectAnomalies(): Promise<DetectResult> {
  return apiFetch<DetectResult>('/anomalies/detect/', { method: 'POST', body: {} });
}

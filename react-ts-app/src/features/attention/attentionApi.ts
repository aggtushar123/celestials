// Thin apiFetch wrappers over revenact-backend's /dashboard/attention/ service.
import { apiFetch } from '../../lib/apiClient';
import type { CurrencyCode } from '../auth/authSlice';

export type AttentionKind = 'renewal' | 'risk' | 'going_quiet' | 'support' | 'anomaly';

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  title: string;
  reason: string;
  at_stake: number;
  urgency: number;
  score: number;
  customer_id: number | null;
  companies: { id: number; name: string }[];
  fingerprint?: unknown;
}

export interface AttentionResponse {
  items: AttentionItem[];
  currency: CurrencyCode;
  filters: {
    owners: { value: string; name: string }[];
    lifecycles: { value: string; name: string }[];
    customers: { value: string; name: string }[];
  };
}

export function fetchAttention(query: string): Promise<AttentionResponse> {
  return apiFetch<AttentionResponse>(query ? `/dashboard/attention/?${query}` : '/dashboard/attention/');
}

export function snooze(key: string, choice: { days: number } | { done: true }): Promise<void> {
  const body = { key, ...choice };
  return apiFetch<void>('/dashboard/attention/snooze/', { method: 'POST', body });
}

export function unsnooze(key: string): Promise<void> {
  const encodedKey = encodeURIComponent(key);
  return apiFetch<void>(`/dashboard/attention/snooze/${encodedKey}/`, { method: 'DELETE' });
}

// Thin apiFetch wrappers over revenact-backend's knowledge gaps and the
// account brief — see docs/API_CONTRACTS.md's second `knowledge` section.
import { apiFetch } from '../../lib/apiClient';
import type { MessageSource } from '../../pages/copilot/types';

export interface KnowledgeGap {
  id: number;
  subject: string;
  customer: { id: number; name: string };
  function: string;
  function_display: string;
  assignee: { id: number; name: string } | null;
  source: 'copilot' | 'question';
  times_asked: number;
  status: 'open' | 'filled' | 'dismissed';
  first_asked_at: string;
  last_asked_at: string;
}

export interface BriefGap {
  id: number;
  subject: string;
  times_asked: number;
  function: string;
}

export interface AccountBrief {
  use_cases: string[];
  stakeholders: { name: string; cares_about: string }[];
  open_threads: string[];
  sources: MessageSource[];
  /** Citations this reader may not open; the brief still shows. */
  hidden_sources: number;
  generated_at: string | null;
  generated_by: { id: number; name: string } | null;
  gaps: BriefGap[];
}

export function fetchBrief(customerId: number): Promise<AccountBrief> {
  return apiFetch<AccountBrief>(`/customers/${customerId}/brief/`);
}

export function generateBrief(customerId: number): Promise<AccountBrief> {
  return apiFetch<AccountBrief>(`/customers/${customerId}/brief/`, { method: 'POST', body: {} });
}

export function fetchGaps(params: { customerId?: number; status?: KnowledgeGap['status'] } = {}): Promise<KnowledgeGap[]> {
  const query = [
    params.customerId ? `customer=${params.customerId}` : '',
    params.status ? `status=${params.status}` : '',
  ].filter(Boolean).join('&');
  return apiFetch<KnowledgeGap[]>(`/knowledge/gaps/${query ? `?${query}` : ''}`);
}

export function answerGap(gapId: number, body: string): Promise<{ gap: KnowledgeGap }> {
  return apiFetch<{ gap: KnowledgeGap }>(`/knowledge/gaps/${gapId}/answer/`, {
    method: 'POST',
    body: { body },
  });
}

export function dismissGap(gapId: number): Promise<KnowledgeGap> {
  return apiFetch<KnowledgeGap>(`/knowledge/gaps/${gapId}/dismiss/`, { method: 'POST', body: {} });
}

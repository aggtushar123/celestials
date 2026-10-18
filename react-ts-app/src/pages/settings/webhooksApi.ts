// Thin apiFetch wrappers — same pattern as pages/scenarios/scenarioApi.ts.
// Mirrors revenact-backend's services/webhooks — see
// docs/API_CONTRACTS.md's `webhooks` section.
import { apiFetch } from '../../lib/apiClient';

export type WebhookEvent = 'customer.created';

export interface WebhookDelivery {
  id: number;
  success: boolean;
  status_code: number | null;
  error: string;
  sent_at: string;
}

export interface Webhook {
  id: number;
  url: string;
  event: WebhookEvent;
  event_display: string;
  secret: string;
  is_active: boolean;
  created_at: string;
  recent_deliveries: WebhookDelivery[];
}

export interface WebhookWritePayload {
  url: string;
  event: WebhookEvent;
}

// Pagination is off on this endpoint (see WebhookListCreateView's own
// docstring) — a plain array.
export function fetchWebhooks(): Promise<Webhook[]> {
  return apiFetch<Webhook[]>('/webhooks/');
}

export function createWebhook(payload: WebhookWritePayload): Promise<Webhook> {
  return apiFetch<Webhook>('/webhooks/', { method: 'POST', body: payload });
}

export function updateWebhook(id: number, payload: Partial<Pick<Webhook, 'is_active' | 'url'>>): Promise<Webhook> {
  return apiFetch<Webhook>(`/webhooks/${id}/`, { method: 'PATCH', body: payload });
}

export function deleteWebhook(id: number): Promise<null> {
  return apiFetch<null>(`/webhooks/${id}/`, { method: 'DELETE' });
}

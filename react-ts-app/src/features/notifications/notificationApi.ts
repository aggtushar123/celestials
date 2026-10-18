// Thin wrappers over apiClient's apiFetch — same pattern as
// pages/copilot/copilotApi.ts's own.
import { apiFetch } from '../../lib/apiClient';
import type { Notification } from './types';

// Pagination is off on this endpoint (see NotificationListView's own
// docstring) — a plain array, one person's own short real list.
export function fetchNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>('/notifications/');
}

export function markNotificationRead(id: number): Promise<Notification> {
  return apiFetch<Notification>(`/notifications/${id}/read/`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>('/notifications/read-all/', { method: 'POST' });
}

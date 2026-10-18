// Thin apiFetch wrappers over revenact-backend's brief delivery — see
// docs/API_CONTRACTS.md's `metrics` brief-schedule section.
import { apiFetch } from '../../lib/apiClient';

export type Cadence = 'weekly' | 'monthly';

export interface BriefSchedule {
  /** Null when nothing is scheduled: the endpoint answers rather than 404ing. */
  cadence: Cadence | null;
  /** The last few characters of the hook. The URL itself never comes back. */
  destination_hint: string;
  weekday: number | null;
  day: number | null;
  is_active: boolean;
  last_sent_at: string | null;
}

export interface ScheduleWrite {
  destination?: string;
  cadence?: Cadence;
  weekday?: number;
  day?: number;
  is_active?: boolean;
}

export function fetchBriefSchedule(): Promise<BriefSchedule> {
  return apiFetch<BriefSchedule>('/metrics/brief/schedule/');
}

export function createBriefSchedule(body: ScheduleWrite): Promise<BriefSchedule> {
  return apiFetch<BriefSchedule>('/metrics/brief/schedule/', { method: 'POST', body });
}

export function updateBriefSchedule(body: ScheduleWrite): Promise<BriefSchedule> {
  return apiFetch<BriefSchedule>('/metrics/brief/schedule/', { method: 'PATCH', body });
}

export function removeBriefSchedule(): Promise<null> {
  return apiFetch<null>('/metrics/brief/schedule/', { method: 'DELETE' });
}

export function sendBriefNow(): Promise<{ sent: boolean; detail: string }> {
  return apiFetch<{ sent: boolean; detail: string }>('/metrics/brief/schedule/send/', {
    method: 'POST',
    body: {},
  });
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

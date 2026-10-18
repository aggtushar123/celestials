// Google Calendar meetings (backend services/calendar, spec
// 2026-10-17-google-calendar-design). The owner reads every field of their
// own meetings; colleagues read a customer's meetings without description,
// location or attendee addresses.
import { apiFetch } from '../../lib/apiClient';

export interface MeetingRef {
  id: number;
  name: string;
}

export interface Meeting {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: 'confirmed' | 'tentative';
  owner: MeetingRef | null;
  organizer_email: string;
  attendee_count: number;
  meet_url: string;
  customer: MeetingRef | null;
  account: MeetingRef | null;
  /** Only on the reader's own meetings. */
  description?: string;
  html_link?: string;
}

export type CalendarState = 'connected' | 'needs_consent' | 'not_connected';

export interface CalendarStatus {
  calendar: CalendarState;
  last_synced_at: string | null;
}

export function fetchMyMeetings(from: Date, to: Date): Promise<Meeting[]> {
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return apiFetch<{ meetings: Meeting[] }>(`/calendar/meetings/?${query}`).then((d) => d.meetings);
}

export function fetchCustomerMeetings(customerId: number): Promise<Meeting[]> {
  return apiFetch<{ meetings: Meeting[] }>(`/calendar/customers/${customerId}/meetings/`).then((d) => d.meetings);
}

export function fetchCalendarStatus(): Promise<CalendarStatus> {
  return apiFetch<CalendarStatus>('/calendar/status/');
}

export interface BookingBody {
  customer_id: number;
  contact_ids: number[];
  title: string;
  starts_at: string;
  ends_at: string;
  description: string;
  /** One per booking attempt the person makes: a retry books once. */
  request_id: string;
}

/** POST calendar/meetings/: on the reader's own calendar, with Meet; Google
 *  emails the invites. */
export function bookMeeting(body: BookingBody): Promise<Meeting> {
  return apiFetch<{ meeting: Meeting }>('/calendar/meetings/', { method: 'POST', body }).then((d) => d.meeting);
}

/** The server's sentence for a refused booking, in either error shape. */
export function bookingRefusal(err: unknown): string {
  const body = (err as { body?: unknown } | null)?.body as { error?: { message?: unknown }; detail?: unknown } | undefined;
  if (typeof body?.error?.message === 'string') return body.error.message;
  if (typeof body?.detail === 'string') return body.detail;
  return "Couldn't book the meeting. Try again.";
}

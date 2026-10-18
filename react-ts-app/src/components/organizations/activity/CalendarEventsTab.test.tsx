import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CalendarEventsTab } from './CalendarEventsTab';
import type { CalendarEvent } from '../../../features/customers/customersSlice';
import type { Meeting } from '../../../features/calendar/calendarApi';

const seeded: CalendarEvent = { id: 1, title: 'Renewal review', description: 'Seeded', type: 'review', event_date: '2026-10-20', start_time: '10:00:00', end_time: '11:00:00', attendee_count: 2 };
const local = (d: number, h: number) => new Date(2026, 9, d, h).toISOString();
const meeting: Meeting = {
  id: 9,
  title: 'Twilio QBR',
  starts_at: local(20, 15),
  ends_at: local(20, 16),
  all_day: false,
  status: 'confirmed',
  owner: { id: 3, name: 'Faiz' },
  organizer_email: 'faiz@tryalfred.onworkspace.com',
  attendee_count: 4,
  meet_url: 'https://meet.google.com/abc-defg-hij',
  customer: { id: 7, name: 'Twilio' },
  account: null,
};

describe('Calendar Events: Google Calendar meetings beside the seeded events', () => {
  it('shows a synced meeting in its day, with whose calendar, attendees and a Join link', () => {
    render(<CalendarEventsTab events={[seeded]} meetings={[meeting]} isLoading={false} error={null} />);
    const row = screen.getByRole('article', { name: 'Twilio QBR' });
    expect(row).toHaveTextContent('3:00 pm – 4:00 pm');
    expect(row).toHaveTextContent("Faiz's calendar");
    expect(row).toHaveTextContent('4 attendees');
    expect(within(row).getByRole('link', { name: 'Join Twilio QBR' })).toHaveAttribute('href', meeting.meet_url);
    // Same day as the seeded review: one day header for both.
    expect(screen.getAllByText('Oct 20, 2026')).toHaveLength(1);
    expect(screen.getByText('Renewal review')).toBeInTheDocument();
  });

  it('counts meetings when deciding it is empty', () => {
    render(<CalendarEventsTab events={[]} meetings={[meeting]} isLoading={false} error={null} />);
    expect(screen.queryByText('No calendar events')).toBeNull();
    render(<CalendarEventsTab events={[]} meetings={[]} isLoading={false} error={null} />);
    expect(screen.getByText('No calendar events')).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AllActivityTab } from './AllActivityTab';
import type { AllActivityTabProps } from './AllActivityTab';

// Unit tier: the tab is presentational — ActivityFeed owns every fetch
// and hands the seven already-loaded lists down.

const empty: AllActivityTabProps = {
  activities: [],
  emails: [],
  tasks: [],
  notes: [],
  tickets: [],
  calendarEvents: [],
  surveys: [],
  isLoading: false,
  errors: [],
};

const activity = {
  id: 1,
  type: 'renewal_proposal_submitted',
  type_display: 'Renewal Proposal Submitted',
  occurred_at: '2026-03-15',
  links: 1,
  watchers: 4,
};

const email = {
  id: 2,
  subject: 'Renewal Prep: Expansion Proposal Draft',
  sender_name: 'Sarah Chen',
  recipient_name: 'Edgar Holmes',
  body: 'Draft expansion proposal attached. Looking to grow from 200 to 500 seats.',
  sent_at: '2026-03-12T14:00:00Z',
  links: 0,
  watchers: 0,
  is_starred: true,
};

const task = {
  id: 3,
  title: 'Send renewal paperwork',
  assignee_name: 'Edgar Holmes',
  due_date: '2026-04-01',
  priority: 'high' as const,
  status: 'in-progress' as const,
};

const note = {
  id: 4,
  title: 'Commercial Negotiation Summary',
  author_name: 'Edgar Holmes',
  body: 'Customer requested 15% discount for a 3-year commitment.',
  logged_at: '2026-03-15',
  links: 2,
};

const ticket = {
  id: 5,
  ticket_number: 'TKT-2003',
  title: 'Mobile app login fails on iOS 18',
  assignee_name: 'Engineering',
  status: 'open' as const,
  priority: 'critical' as const,
  opened_at: '2026-03-10',
  links: 0,
  connector_name: null, connector_provider: null, department: '', department_display: '', description: '', requester_name: '', requester_email: '', external_url: '', synced_at: null,
};

const event = {
  id: 6,
  title: 'Quarterly Business Review',
  description: 'QBR with the exec sponsor',
  type: 'review' as const,
  event_date: '2026-03-20',
  start_time: '14:00:00',
  end_time: '15:00:00',
  attendee_count: 6,
};

const survey = {
  id: 7,
  survey_type: 'nps' as const,
  survey_type_display: 'NPS',
  status: 'responded' as const,
  status_display: 'Responded',
  score: 9,
  sent_at: '2026-03-01T09:00:00Z',
  responded_at: '2026-03-05T11:00:00Z',
  companies: [],
  account_id: null,
  account_name: null,
  created_at: '2026-03-01T09:00:00Z',
};

const everything: AllActivityTabProps = {
  ...empty,
  activities: [activity],
  emails: [email],
  tasks: [task],
  notes: [note],
  tickets: [ticket],
  calendarEvents: [event],
  surveys: [survey],
};

describe('AllActivityTab', () => {
  it('shows every source in one stream', () => {
    // The whole point: "All" used to render only Activities, so the
    // other six were reachable only by picking their own filter.
    render(<AllActivityTab {...everything} />);

    expect(screen.getByText('Renewal Proposal Submitted')).toBeInTheDocument();
    expect(screen.getByText('Renewal Prep: Expansion Proposal Draft')).toBeInTheDocument();
    expect(screen.getByText('Send renewal paperwork')).toBeInTheDocument();
    expect(screen.getByText('Commercial Negotiation Summary')).toBeInTheDocument();
    expect(screen.getByText('TKT-2003 · Mobile app login fails on iOS 18')).toBeInTheDocument();
    expect(screen.getByText('Quarterly Business Review')).toBeInTheDocument();
    expect(screen.getByText('NPS survey')).toBeInTheDocument();
  });

  it('labels each row with its type so a mixed stream stays scannable', () => {
    render(<AllActivityTab {...everything} />);

    for (const label of ['Activity', 'Email', 'Task', 'Note', 'Ticket', 'Event', 'Survey']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('groups by day, newest first', () => {
    render(<AllActivityTab {...everything} />);

    const headers = screen
      .getAllByText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/)
      .map((el) => el.textContent);

    // The task is due 1 Apr, so it sorts above everything that has
    // already happened — the same way an upcoming calendar event does.
    // A reverse-chronological feed carrying future-dated items puts
    // them at the top, which is what you want for "what's next".
    expect(headers).toEqual([
      '1 Apr 2026',
      '20 Mar 2026',
      '15 Mar 2026',
      '12 Mar 2026',
      '10 Mar 2026',
      '5 Mar 2026',
    ]);
  });

  it('puts same-day items from different sources under one header', () => {
    // The activity and the note are both 15 Mar — they must share a
    // group, not produce two headers with the same date.
    render(<AllActivityTab {...empty} activities={[activity]} notes={[note]} />);

    expect(screen.getAllByText('15 Mar 2026')).toHaveLength(1);
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('collapses a timestamp to its day so emails group with dated records', () => {
    // sent_at is a full timestamp; occurred_at is a plain date. Both
    // have to land in the same bucket when they fall on the same day.
    const sameDayEmail = { ...email, sent_at: '2026-03-15T08:30:00Z' };
    render(<AllActivityTab {...empty} activities={[activity]} emails={[sameDayEmail]} />);

    expect(screen.getAllByText('15 Mar 2026')).toHaveLength(1);
  });

  it('marks a task by when it is due, not as something that happened', () => {
    render(<AllActivityTab {...empty} tasks={[task]} />);
    expect(screen.getByText(/Due Apr 1st/)).toBeInTheDocument();
  });

  it('dates a responded survey by its response, not by when it was sent', () => {
    render(<AllActivityTab {...empty} surveys={[survey]} />);

    expect(screen.getByText('5 Mar 2026')).toBeInTheDocument();
    expect(screen.queryByText('1 Mar 2026')).not.toBeInTheDocument();
  });

  it('dates an unanswered survey by when it went out', () => {
    render(
      <AllActivityTab
        {...empty}
        surveys={[{ ...survey, status: 'sent', status_display: 'Sent', score: null, responded_at: null }]}
      />
    );

    expect(screen.getByText('1 Mar 2026')).toBeInTheDocument();
  });

  it('shows an empty state when nothing has happened', () => {
    render(<AllActivityTab {...empty} />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });

  it('still renders what loaded when one source failed', () => {
    // A partial failure must not blank the whole feed — the rows that
    // arrived are still worth reading.
    render(
      <AllActivityTab {...empty} activities={[activity]} errors={['Could not load emails.']} />
    );

    expect(screen.getByText('Renewal Proposal Submitted')).toBeInTheDocument();
    expect(screen.getByText(/Could not load emails\./)).toBeInTheDocument();
  });

  it('shows the error alone when nothing loaded at all', () => {
    render(<AllActivityTab {...empty} errors={['Not found.']} />);

    expect(screen.getByText('Not found.')).toBeInTheDocument();
    expect(screen.queryByText('No activity yet')).not.toBeInTheDocument();
  });

  it('keeps showing what it has while a slower source is still loading', () => {
    render(<AllActivityTab {...empty} activities={[activity]} isLoading />);
    expect(screen.getByText('Renewal Proposal Submitted')).toBeInTheDocument();
  });

  it('shows a loading state only when there is nothing to show yet', () => {
    render(<AllActivityTab {...empty} isLoading />);
    expect(screen.getByText('Loading activity…')).toBeInTheDocument();
  });
});

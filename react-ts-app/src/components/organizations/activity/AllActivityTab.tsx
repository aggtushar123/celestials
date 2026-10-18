import {
  CheckCircle,
  Mail,
  CheckSquare,
  FileText,
  LifeBuoy,
  Calendar,
  Star,
  Eye,
  Link2,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  Activity,
  CalendarEvent,
  Email,
  Note,
  Survey,
  Task,
  Ticket,
} from '../../../features/customers/customersSlice';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** "2026-03-05" -> "Mar 5th" — the card's own date. Parsed by hand
 *  rather than through `Date`, same reasoning as every other tab here:
 *  a date-only string run through `Date` shifts a day in some
 *  timezones. */
function formatCardDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${ordinal(d)}`;
}

/** "2026-03-05" -> "5 Mar 2026" — the day-group header, matching
 *  ActivitiesTab's so the merged stream reads as the same timeline. */
function formatGroupHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Several sources date themselves with a full timestamp (`sent_at`)
 *  and others with a plain date (`occurred_at`). Everything groups by
 *  day, so both collapse to "YYYY-MM-DD" — which also sorts correctly
 *  as a plain string, no Date needed. */
function toDay(value: string): string {
  return value.slice(0, 10);
}

type FeedKind = 'activity' | 'email' | 'task' | 'note' | 'ticket' | 'event' | 'survey';

interface FeedItem {
  key: string;
  kind: FeedKind;
  day: string;
  title: string;
  /** The one line under the title — who, or what state it's in. */
  detail: string;
  links?: number;
  watchers?: number;
  starred?: boolean;
  /** Tasks are dated by when they're *due*, not when they happened, so
   *  the card says so rather than letting a future date look like a
   *  past event. */
  datePrefix?: string;
}

const KIND_STYLE: Record<FeedKind, { label: string; icon: ReactNode; chip: string }> = {
  activity: {
    label: 'Activity',
    icon: <CheckCircle className="w-3 h-3" />,
    chip: 'bg-success-dim text-success border-success/30',
  },
  email: {
    label: 'Email',
    icon: <Mail className="w-3 h-3" />,
    chip: 'bg-accent-dim text-accent border-accent/30',
  },
  task: {
    label: 'Task',
    icon: <CheckSquare className="w-3 h-3" />,
    chip: 'bg-info-dim text-info border-info/30',
  },
  note: {
    label: 'Note',
    icon: <FileText className="w-3 h-3" />,
    chip: 'bg-subtle text-ink-muted border-line',
  },
  ticket: {
    label: 'Ticket',
    icon: <LifeBuoy className="w-3 h-3" />,
    chip: 'bg-danger-dim text-danger border-danger/30',
  },
  event: {
    label: 'Event',
    icon: <Calendar className="w-3 h-3" />,
    chip: 'bg-warning-dim text-warning border-warning/30',
  },
  survey: {
    label: 'Survey',
    icon: <Star className="w-3 h-3" />,
    chip: 'bg-accent-dim text-accent border-accent/30',
  },
};

/** Trims a body/preview to one scannable line. The per-type tabs show
 *  the full text; this stream is for spotting the thing you want, then
 *  clicking through to its own filter. */
function preview(text: string, max = 110): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** This tab reads seven independent sources, so one malformed response
 *  would otherwise take the whole feed down with it — a much wider
 *  blast radius than the per-type tabs, where a bad surveys response
 *  could only ever break the surveys tab. Anything that isn't a real
 *  array is treated as "this source has nothing", which degrades to a
 *  shorter timeline instead of an empty screen. */
function safe<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

export interface AllActivityTabProps {
  activities: Activity[];
  emails: Email[];
  tasks: Task[];
  notes: Note[];
  tickets: Ticket[];
  calendarEvents: CalendarEvent[];
  surveys: Survey[];
  isLoading: boolean;
  /** Per-source failures. A source that failed is simply missing from
   *  the stream, so the names are surfaced rather than silently
   *  showing a shorter timeline that looks complete. */
  errors: string[];
}

/** Everything on one timeline — the "All" filter.
 *
 *  It used to render ActivitiesTab, so "All" and "Activities" showed
 *  the identical list and the other five sources were reachable only
 *  by picking their own filter. This merges every source the feed has
 *  already fetched into one day-grouped stream.
 *
 *  Cards here are deliberately more compact than the per-type tabs'.
 *  Those are built for reading one kind of thing (an email opens a
 *  reading panel, a survey has its own actions); this one is built for
 *  scanning across kinds, so every row has the same shape and the type
 *  is a chip rather than a different layout. */
export function AllActivityTab({
  activities,
  emails,
  tasks,
  notes,
  tickets,
  calendarEvents,
  surveys,
  isLoading,
  errors,
}: AllActivityTabProps) {
  const items: FeedItem[] = [
    ...safe(activities).map((a) => ({
      key: `activity-${a.id}`,
      kind: 'activity' as const,
      day: toDay(a.occurred_at),
      title: a.type_display,
      detail: '',
      links: a.links,
      watchers: a.watchers,
    })),
    ...safe(emails).map((e) => ({
      key: `email-${e.id}`,
      kind: 'email' as const,
      day: toDay(e.sent_at),
      title: e.subject,
      detail: `${e.sender_name} → ${e.recipient_name} · ${preview(e.body, 70)}`,
      links: e.links,
      watchers: e.watchers,
      starred: e.is_starred,
    })),
    ...safe(tasks).map((t) => ({
      key: `task-${t.id}`,
      kind: 'task' as const,
      day: toDay(t.due_date),
      title: t.title,
      detail: `${t.assignee_name} · ${t.status.replace('-', ' ')} · ${t.priority} priority`,
      datePrefix: 'Due',
    })),
    ...safe(notes).map((n) => ({
      key: `note-${n.id}`,
      kind: 'note' as const,
      day: toDay(n.logged_at),
      title: n.title,
      detail: `${n.author_name} · ${preview(n.body, 80)}`,
      links: n.links,
    })),
    ...safe(tickets).map((t) => ({
      key: `ticket-${t.id}`,
      kind: 'ticket' as const,
      day: toDay(t.opened_at),
      title: `${t.ticket_number} · ${t.title}`,
      detail: `${t.assignee_name} · ${t.status.replace('-', ' ')} · ${t.priority}`,
      links: t.links,
    })),
    ...safe(calendarEvents).map((e) => ({
      key: `event-${e.id}`,
      kind: 'event' as const,
      day: toDay(e.event_date),
      title: e.title,
      detail: `${e.start_time.slice(0, 5)}–${e.end_time.slice(0, 5)} · ${e.type} · ${e.attendee_count} attending`,
    })),
    ...safe(surveys).map((s) => ({
      key: `survey-${s.id}`,
      kind: 'survey' as const,
      // A responded survey belongs on the day it came back; one still
      // outstanding belongs on the day it went out.
      day: toDay(s.responded_at ?? s.sent_at),
      title: `${s.survey_type_display} survey`,
      detail:
        s.score !== null
          ? `${s.status_display} · scored ${s.score}`
          : String(s.status_display),
    })),
  ];

  const grouped = items.reduce<Record<string, FeedItem[]>>((acc, item) => {
    if (!acc[item.day]) acc[item.day] = [];
    acc[item.day].push(item);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16 opacity-40">
        <span className="text-sm font-semibold text-ink-faint">Loading activity…</span>
      </div>
    );
  }

  // Only a total failure replaces the feed. If some sources loaded,
  // showing them beats showing nothing — the banner below says what's
  // missing.
  if (items.length === 0 && errors.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16">
        <span className="text-sm font-semibold text-danger">{errors[0]}</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-16 opacity-40">
        <Inbox className="w-10 h-10 text-ink-faint mb-2" />
        <span className="text-sm font-semibold text-ink-faint">No activity yet</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-subtle/20">
      {errors.length > 0 && (
        <div className="flex items-start gap-2 mb-5 rounded-lg border border-danger/30 bg-danger-dim/40 px-3.5 py-2.5">
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-px" />
          <span className="text-[12.5px] font-semibold text-danger">
            Some of this feed couldn’t be loaded: {errors.join(' ')}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-8 relative">
        <div className="absolute left-[13px] top-10 bottom-4 w-0.5 bg-accent-dim" />
        {sortedGroups.map(([day, group]) => (
          <div key={day} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-[28px] h-[28px] rounded-full bg-surface border border-accent/20 flex items-center justify-center shrink-0 z-10">
                <div className="w-3 h-3 border-2 border-accent/40 rounded-md" />
              </div>
              <span className="text-[11px] font-bold text-ink-faint uppercase tracking-wider">
                {formatGroupHeader(day)}
              </span>
              <span className="text-[11px] font-medium text-ink-faint/70">
                {group.length} {group.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="flex flex-col gap-3 ml-[13px] pl-[15px]">
              {group.map((item) => (
                <FeedRow key={item.key} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const style = KIND_STYLE[item.kind];

  return (
    <div className="bg-surface rounded-xl border border-line-subtle shadow-sm p-4 flex flex-col gap-2 group hover:border-accent/30 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border shrink-0 ${style.chip}`}
          >
            {style.icon}
            {style.label}
          </span>
          <h4 className="font-bold text-ink text-[13.5px] truncate group-hover:text-accent transition-colors">
            {item.title}
          </h4>
          {item.starred && <Star className="w-3 h-3 text-warning shrink-0" fill="currentColor" />}
        </div>
        <span className="text-[11.5px] font-bold text-ink-faint shrink-0 whitespace-nowrap">
          {item.datePrefix ? `${item.datePrefix} ` : ''}
          {formatCardDate(item.day)}
        </span>
      </div>

      {item.detail && (
        <p className="text-[12.5px] text-ink-muted leading-snug pl-1 line-clamp-2">{item.detail}</p>
      )}

      {((item.links ?? 0) > 0 || (item.watchers ?? 0) > 0) && (
        <div className="flex items-center gap-4 pl-1">
          {(item.watchers ?? 0) > 0 && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-ink-faint">
              <Eye className="w-3 h-3" />
              <span>{item.watchers}</span>
            </div>
          )}
          {(item.links ?? 0) > 0 && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-accent">
              <Link2 className="w-3 h-3" />
              <span>
                {item.links} {item.links === 1 ? 'Link' : 'Links'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

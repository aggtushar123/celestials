import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Video } from 'lucide-react';
import { fetchMyMeetings, type Meeting } from '../../features/calendar/calendarApi';
import { meetingWhen } from '../../features/calendar/meetingText';
import { fetchFeed } from '../../features/work/workApi';
import type { FeedGroupKey } from '../../features/work/workTypes';
import { scheduled } from '../../features/work/scheduled';
import { formatDate } from '../../features/customers/formatters';
import { META_DANGER, NUM, QUIET, TYPE } from '../ui';
import { RailCard } from '../copilot/RailCard';
import { useFeedChanges, useTaskChanges, useTodoAdded } from './taskChanges';
import { useTaskLink } from './useTaskLink';

function when(group: FeedGroupKey, due: string) {
  if (group === 'overdue') return <span className={`${META_DANGER} font-semibold`}>Overdue</span>;
  if (group === 'today') return <span className={TYPE.meta}>Today</span>;
  return <span className={`${TYPE.meta} ${NUM}`}>{formatDate(due).replace(/ \d{4}$/, '')}</span>;
}

/** Meetings shown: the next few in the coming week, one in progress included. */
const MEETINGS_SHOWN = 3;
const WEEK_MS = 7 * 86_400_000;
const IN_PROGRESS_MS = 30 * 60_000;

/** Scheduled (owner, 2026-10-16): the Next event template on Work's right
 *  pane, listing the reader's Google Calendar meetings for the week (Calendar
 *  delivery 2, 2026-10-17), then their dated to-dos and tasks (the feed's
 *  overdue, today, this week and later groups), each opening its panel. It
 *  reads again when a task changes or a to-do is added. Meetings that can't
 *  be read (no Calendar connected) simply don't show. `onWork` false (the
 *  Communications pane, the account settings rail): each opens the task on
 *  Work, where its panel lives. */
export function ScheduledCard({ onWork = true }: { onWork?: boolean } = {}) {
  const [rows, setRows] = useState<ReturnType<typeof scheduled> | null>(null);
  const [failed, setFailed] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const taskLink = useTaskLink();

  useEffect(() => {
    const now = Date.now();
    fetchMyMeetings(new Date(now - IN_PROGRESS_MS), new Date(now + WEEK_MS))
      .then((found) => setMeetings(found.filter((m) => new Date(m.ends_at).getTime() > now).slice(0, MEETINGS_SHOWN)))
      .catch(() => setMeetings([]));
  }, []);

  const load = useCallback(() => {
    fetchFeed(['task', 'todo'])
      .then((payload) => {
        setRows(scheduled(payload));
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useTaskChanges(load);
  useFeedChanges(load);
  useTodoAdded(load);

  return (
    <RailCard title="Scheduled" icon={Calendar}>
      {failed && rows === null ? (
        <p className={`px-1 ${TYPE.bodyMuted}`}>Couldn't load what's scheduled.</p>
      ) : rows === null ? (
        <p className={`px-1 ${TYPE.meta}`}>Loading…</p>
      ) : rows.length === 0 && meetings.length === 0 ? (
        <div className="px-1">
          <p className={TYPE.bodyMuted}>Nothing scheduled.</p>
          <p className={TYPE.meta}>Meetings, and to-dos and tasks with a due date, will show here.</p>
        </div>
      ) : (
        <>
          {meetings.length > 0 ? (
            <ul aria-label="Meetings" className="flex flex-col">
              {meetings.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <p className={`${TYPE.body} truncate`}>{m.title || 'Meeting'}</p>
                    <p className={`${TYPE.meta} ${NUM} truncate`}>
                      {meetingWhen(m)}
                      {m.customer ? ` · ${m.customer.name}` : ''}
                    </p>
                  </div>
                  {m.meet_url ? (
                    <a href={m.meet_url} target="_blank" rel="noreferrer noopener" aria-label={`Join ${m.title || 'meeting'}`} className={QUIET}>
                      <Video className="h-4 w-4" aria-hidden="true" />
                      Join
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {rows.length > 0 ? (
            <ul aria-label="Scheduled to-dos and tasks" className={`flex flex-col ${meetings.length > 0 ? 'mt-2 border-t border-line-subtle pt-2' : ''}`}>
              {rows.map(({ item, group }) => (
                <li key={item.key} className="flex items-baseline gap-2 rounded-md px-1 py-1 hover:bg-subtle">
                  <span className="w-16 shrink-0">{when(group, item.due_date as string)}</span>
                  <Link {...(onWork ? taskLink(item.id) : { to: `/work?queue=mine&task=${item.id}` })} className={`${TYPE.body} block min-h-11 min-w-0 flex-1 truncate py-3 hover:underline sm:min-h-0 sm:py-0`}>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </RailCard>
  );
}

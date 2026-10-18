import { formatRelativeTime } from '../../features/customers/formatters';
import { eventSentence, WORK } from '../../features/work/workText';
import type { TaskEvent } from '../../features/work/workTypes';
import { useAppSelector } from '../../hooks';
import { MONO } from '../organizations/portfolio/styles';

/** The task's history in plain sentences (spec §1.5), oldest first; a
 *  comment's words sit under its line. */
export function ActivityTrail({ events }: { events: TaskEvent[] }) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  if (events.length === 0) return <p className="text-[13px] text-ink-muted">{WORK.NO_ACTIVITY}</p>;
  return (
    <ol aria-label={WORK.ACTIVITY} className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} data-event={event.kind} className="flex flex-col gap-1">
          <p className="text-[13px] text-ink">{eventSentence(event, me)}</p>
          {event.kind === 'comment' && event.body ? (
            <p className="max-w-[70ch] whitespace-pre-line break-words border-l-2 border-line pl-3 text-[13px] text-ink">{event.body}</p>
          ) : null}
          <time dateTime={event.created_at} className={`text-[11px] text-ink-muted ${MONO}`}>
            {formatRelativeTime(event.created_at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

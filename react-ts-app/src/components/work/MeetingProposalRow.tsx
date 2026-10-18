import { useId, useState } from 'react';
import { bookProposal, dismissProposal } from '../../features/work/workApi';
import type { FeedGroupKey, FeedItem, MeetingProposalFeedItem } from '../../features/work/workTypes';
import { ApiError } from '../../lib/apiClient';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Badge, BUTTON, FORM_ALERT, INPUT, QUIET, TYPE } from '../ui';
import type { Settle } from './FeedDecideRows';
import { FeedRowMeta, KIND_ICON, ROW_FOCUS } from './FeedRowParts';

const two = (n: number) => String(n).padStart(2, '0');
const dateOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const timeOf = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

function names(people: { name: string }[]) {
  const all = people.map((p) => p.name);
  return all.length <= 1 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
}

function refusal(err: unknown): string {
  const body = err instanceof ApiError ? (err.body as { detail?: unknown } | null) : null;
  return typeof body?.detail === 'string' ? body.detail : "Couldn't book it. Try again.";
}

/** A meeting a colleague's email asked for (email agent, 2026-10-17): the
 *  agent's topic, who asked, who comes, and the earliest time everyone is
 *  free, which the reader may change before Book. Never the email itself. */
export function MeetingProposalRow({
  item,
  group,
  onSettled,
  onLost,
}: {
  item: MeetingProposalFeedItem;
  group: FeedGroupKey;
  onSettled: (item: FeedItem, settle: Settle) => void;
  onLost: (item: FeedItem, text: string) => void;
}) {
  const titleId = useId();
  const ids = useId();
  const d = item.detail;
  const Icon = KIND_ICON.meeting_proposal;
  const proposed = d.proposed_start ? new Date(d.proposed_start) : null;
  const [date, setDate] = useState(proposed ? dateOf(proposed) : '');
  const [time, setTime] = useState(proposed ? timeOf(proposed) : '');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const ready = Boolean(date && time) && !busy;

  async function book() {
    if (!ready) return;
    setError(null);
    const changed = !proposed || date !== dateOf(proposed) || time !== timeOf(proposed);
    // The reader's own zone: the browser turns local date and time into an instant.
    const body = changed ? { starts_at: new Date(`${date}T${time}`).toISOString() } : {};
    const outcome = await run(() => bookProposal(item.id, body));
    if (!outcome) return;
    if (outcome.ok) return onSettled(item, { text: 'Booked. Google is emailing the invites.' });
    if (outcome.error instanceof ApiError && outcome.error.status === 404) return onLost(item, 'This meeting is no longer waiting on you.');
    setError(refusal(outcome.error));
  }

  async function dismiss() {
    setError(null);
    const outcome = await run(() => dismissProposal(item.id));
    if (!outcome) return;
    if (outcome.ok) return onSettled(item, { text: 'Dismissed.' });
    if (outcome.error instanceof ApiError && outcome.error.status === 404) return onLost(item, 'This meeting is no longer waiting on you.');
    setError(refusal(outcome.error));
  }

  return (
    <li data-item={item.key} className={`flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {item.title}
        </h3>
        <FeedRowMeta item={item} group={group} />
        <p className={`flex flex-wrap items-center gap-2 ${TYPE.bodyMuted}`}>
          <span>{d.requester ? `${d.requester.name} asked for a meeting` : 'A meeting was asked for'}</span>
          {d.urgent ? <Badge>Urgent</Badge> : null}
        </p>
        <p className={TYPE.meta}>
          With {names(d.attendees)} · {d.length_minutes} minutes
        </p>
        {d.without_calendar.length > 0 ? (
          <p className={TYPE.meta}>
            {names(d.without_calendar)} {d.without_calendar.length === 1 ? 'has' : 'have'} no calendar connected: counted as free.
          </p>
        ) : null}
        {!proposed ? <p className={TYPE.meta}>Nobody&apos;s week had a free half hour: pick a time.</p> : null}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-date`} className={TYPE.label}>
              Date
            </label>
            <input id={`${ids}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-time`} className={TYPE.label}>
              Starts
            </label>
            <input id={`${ids}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className={INPUT} />
          </div>
          <button type="button" onClick={() => void book()} aria-disabled={!ready || undefined} className={BUTTON}>
            {busy ? 'Booking…' : 'Book with Meet'}
          </button>
          <button type="button" onClick={() => void dismiss()} aria-disabled={busy || undefined} className={QUIET}>
            Dismiss
          </button>
        </div>
        {error ? (
          <p role="alert" className={FORM_ALERT}>
            {error}
          </p>
        ) : null}
      </article>
    </li>
  );
}

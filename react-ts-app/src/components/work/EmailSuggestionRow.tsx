import { useId, useState } from 'react';
import { formatDate } from '../../features/customers/formatters';
import { decideEmailSuggestion } from '../../features/work/workApi';
import type { EmailSuggestionFeedItem, FeedGroupKey, FeedItem } from '../../features/work/workTypes';
import { ApiError } from '../../lib/apiClient';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Badge, BUTTON, FORM_ALERT, NUM, QUIET, TYPE } from '../ui';
import type { Settle } from './FeedDecideRows';
import { FeedRowMeta, KIND_ICON, ROW_FOCUS } from './FeedRowParts';

function names(people: { name: string }[]) {
  const all = people.map((p) => p.name);
  return all.length <= 1 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
}

/** What the email agent read in the reader's own sent mail (owner decision B,
 *  2026-10-17): a task to give a colleague, or a meeting to ask for. Nobody
 *  else hears of it until the reader says yes here. */
export function EmailSuggestionRow({
  item,
  group,
  onSettled,
  onLost,
}: {
  item: EmailSuggestionFeedItem;
  group: FeedGroupKey;
  onSettled: (item: FeedItem, settle: Settle) => void;
  onLost: (item: FeedItem, text: string) => void;
}) {
  const titleId = useId();
  const d = item.detail;
  const Icon = KIND_ICON.email_suggestion;
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const isTask = d.kind === 'task';
  const who = isTask ? d.assignee?.name : d.approver?.name;

  async function decide(verb: 'confirm' | 'dismiss') {
    setError(null);
    const outcome = await run(() => decideEmailSuggestion(item.id, verb));
    if (!outcome) return;
    if (outcome.ok) {
      const text = verb === 'dismiss' ? 'Dismissed.' : isTask ? `Task given to ${who ?? 'them'}.` : `Request sent to ${who ?? 'them'}.`;
      return onSettled(item, { text });
    }
    if (outcome.error instanceof ApiError && outcome.error.status === 404) return onLost(item, 'This is no longer waiting on you.');
    const body = outcome.error instanceof ApiError ? (outcome.error.body as { detail?: unknown } | null) : null;
    setError(typeof body?.detail === 'string' ? body.detail : "Couldn't do that. Try again.");
  }

  return (
    <li data-item={item.key} className={`flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
          {item.title}
        </h3>
        <FeedRowMeta item={item} group={group} />
        {d.kind === 'task' ? (
          <p className={`flex flex-wrap items-center gap-2 ${TYPE.meta}`}>
            {d.due_date ? (
              <span>
                Due <span className={NUM}>{formatDate(d.due_date)}</span>
              </span>
            ) : (
              <span>No due date</span>
            )}
            {d.urgent ? <Badge>Urgent</Badge> : null}
          </p>
        ) : (
          <p className={`flex flex-wrap items-center gap-2 ${TYPE.meta}`}>
            {d.attendees?.length ? <span>With {names(d.attendees)}</span> : null}
            {d.urgent ? <Badge>Urgent</Badge> : null}
          </p>
        )}
        <p className={TYPE.meta}>From your own email. Nobody else sees this until you say yes, and never the email itself.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void decide('confirm')} aria-disabled={busy || undefined} className={BUTTON}>
            {isTask ? `Give ${who ?? 'them'} the task` : `Send the request to ${who ?? 'them'}`}
          </button>
          <button type="button" onClick={() => void decide('dismiss')} aria-disabled={busy || undefined} className={QUIET}>
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

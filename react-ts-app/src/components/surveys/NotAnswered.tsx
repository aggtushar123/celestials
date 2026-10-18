import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchPending } from '../../features/surveys/surveyApi';
import { dayLabel } from '../../features/surveys/surveyText';
import type { PendingPage, PendingRow, SurveySend } from '../../features/surveys/surveyTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { BUTTON, Card, EmptyState, FOCUS, LoadingState, NUM, TYPE } from '../ui';

function statusText(row: PendingRow): string {
  if (row.status === 'failed') return `Not delivered: ${row.failure ?? 'no reason given'}`;
  if (row.status === 'expired') return 'Link expired';
  // Claimed, but the minute runner has not emailed it yet.
  if (row.status === 'queued') return 'Not sent yet';
  return `Link expires ${dayLabel(row.expires_at)}`;
}

function PendingItem({ row }: { row: PendingRow }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3">
      <span className="min-w-0">
        <span className={`${TYPE.body} font-semibold`}>{row.contact ? row.contact.name : <em className="font-normal text-ink-muted">A deleted contact</em>}</span>
        <span className={TYPE.meta}> · {row.record.name}</span>
      </span>
      <span className={row.status === 'failed' ? 'text-[11px] leading-4 text-danger-ink' : TYPE.meta}>{statusText(row)}</span>
    </li>
  );
}

/** Not answered (spec §2.3): closed by default, and read only when opened
 *  (plan Decision 12). Pending links with their expiry, expired ones, and
 *  failed sends with the reason; people the reader can't open are a count.
 *  Never an email address (the server sends none). */
export function NotAnswered({ send }: { send: SurveySend }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // `send.status` so a send moving from `sending` to `sent` while the
  // disclosure is open re-reads it: otherwise a queued invite stays
  // "Not sent yet" forever once the minute runner has actually finished it.
  const key = `${send.id}#${send.status}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; page: PendingPage | null; error: string | null } | null>(null);
  // The key a fetch has already been started for: reopening the disclosure
  // on the same key (nothing changed) skips a redundant request, whether
  // that fetch has resolved yet or not.
  const fetchedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!open || fetchedKey.current === key) return;
    fetchedKey.current = key;
    let alive = true;
    fetchPending(send.id).then(
      (page) => {
        if (alive) setAnswer({ key, page, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, page: null, error: errorMessage(err, 'Could not load who has not answered.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [open, key, send.id]);

  const current = answer?.key === key ? answer : null;
  let body;
  if (!current) {
    body = <LoadingState label="Loading who has not answered" count={2} />;
  } else if (current.error || !current.page) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-2 px-4 py-3">
        <p className="text-[13px] leading-5 text-danger-ink">{current.error}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={BUTTON}>
          Try again
        </button>
      </div>
    );
  } else {
    const { results, hidden_count: hidden } = current.page;
    body = (
      <>
        {results.length > 0 ? (
          <ul aria-label="Not answered" className="flex flex-col divide-y divide-line-subtle">
            {results.map((row) => (
              <PendingItem key={row.id} row={row} />
            ))}
          </ul>
        ) : (
          <EmptyState size="inline" title="Everyone you can open has answered." />
        )}
        {hidden > 0 ? (
          <p data-part="hidden-pending" className={`px-4 pb-3 ${TYPE.bodyMuted}`}>
            <span className={NUM}>{hidden}</span> more you can't open.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <Card pad="none">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
          className={`flex min-h-11 w-full sm:min-h-12 items-center gap-2 rounded-xl px-4 text-left ${TYPE.title} hover:bg-subtle ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          Not answered
          {current?.page ? (
            <>
              {' '}
              <span className={`${NUM} text-[13px] leading-5 font-normal text-ink-muted`}>{current.page.results.length}</span>
            </>
          ) : null}
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="border-t border-line-subtle">
          {body}
        </div>
      ) : null}
    </Card>
  );
}

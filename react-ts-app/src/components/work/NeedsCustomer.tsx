import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { isQueueRefusal } from '../../features/work/queues';
import { dismissUnmatched, deletesText, fetchUnmatched, goneText, isGone, isLong, matchedText, metaLine, openText, UNMATCHED, type UnmatchedItem } from '../../features/work/unmatched';
import { readRefusal } from '../../features/work/workApi';
import type { QueueKey } from '../../features/agents/bundleTypes';
import { BUTTON, Badge, Card, LoadingState, NUM, QUIET, TYPE, ListCard } from '../ui';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { META_LINK } from './FeedRowParts';
import { MatchDialog } from './MatchDialog';

/** The row's actions are 13px; the link takes the same size, muted like its meta. */
const OPEN_LINK = `${META_LINK} ${TYPE.bodyMuted}`;

interface Loaded {
  items: UnmatchedItem[];
  count: number;
  next: string | null;
}

const isStale = (err: unknown) => err instanceof ApiError && err.status === 400 && typeof err.body === 'object' && err.body !== null && 'cursor' in err.body;

/** "Needs a customer" (round 2 D3 frontend Decisions 1, 2, 4, 6): a routed
 *  queue's Slack and Jira messages that matched no customer, newest first,
 *  25 a page. Drawn only when there is at least one. Match opens the match
 *  dialog (a later task); Dismiss asks first. The queue's toast says the
 *  outcome through `onToast`. */
export function NeedsCustomer({ queue, onCount, onToast, onRefused }: { queue: QueueKey; onCount: (count: number | 'failed') => void; onToast: (text: string) => void; onRefused: (err: unknown) => boolean }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [dismissing, setDismissing] = useState<UnmatchedItem | null>(null);
  const [matching, setMatching] = useState<UnmatchedItem | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const headingId = useId();
  const refused = useRef(onRefused);
  const counted = useRef(onCount);
  useEffect(() => {
    refused.current = onRefused;
    counted.current = onCount;
  });

  // The queue remounts this per queue (TeamQueue keys it), so it starts empty.
  useEffect(() => {
    let alive = true;
    fetchUnmatched(queue).then(
      (page) => {
        if (alive) setData({ items: page.items, count: page.count, next: page.next });
      },
      (err: unknown) => {
        if (!alive) return;
        // A refusal counts none (the queue's empty state stands); a failed read is
        // reported as failed so the queue does not claim nothing is waiting.
        if (isQueueRefusal(err)) {
          counted.current(0);
          refused.current(err);
        } else {
          counted.current('failed');
          setError(true);
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [queue, attempt]);

  const reload = () => {
    setError(false);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    if (data) counted.current(data.count);
  }, [data]);

  async function showMore() {
    if (!data?.next || more === 'busy') return;
    setMore('busy');
    try {
      const page = await fetchUnmatched(queue, data.next);
      setData((cur) => (cur ? { items: [...cur.items, ...page.items], count: page.count, next: page.next } : cur));
      setMore('idle');
    } catch (err) {
      if (isQueueRefusal(err)) refused.current(err);
      else if (isStale(err)) {
        setMore('idle');
        setData(null);
        reload();
      } else setMore('failed');
    }
  }

  const remove = (id: number) => setData((cur) => (cur ? { ...cur, items: cur.items.filter((i) => i.id !== id), count: Math.max(0, cur.count - 1) } : cur));

  async function dismiss(item: UnmatchedItem) {
    try {
      await dismissUnmatched(item.id);
      remove(item.id);
      onToast(UNMATCHED.DISMISSED);
    } catch (err) {
      if (isGone(err)) {
        remove(item.id);
        onToast(goneText(err));
        return;
      }
      throw readRefusal(err, UNMATCHED.DISMISS_FAILED).form ?? UNMATCHED.DISMISS_FAILED;
    }
  }

  if (error && !data)
    return (
      <Card pad="none">
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className={`${TYPE.body} text-danger-ink`}>{UNMATCHED.LOAD}</p>
          <button type="button" onClick={reload} className={BUTTON}>
            {UNMATCHED.RETRY}
          </button>
        </div>
      </Card>
    );
  if (!data)
    return (
      <Card pad="none">
        <LoadingState label={UNMATCHED.LOADING} count={2} />
      </Card>
    );
  // Built before the empty return: a GONE answer can empty the list while the
  // dialog still shows its alert.
  const matchDialog = matching ? (
    <MatchDialog
      item={matching}
      onGone={remove}
      onMatched={(answer) => {
        remove(matching.id);
        setMatching(null);
        onToast(matchedText(answer.record.name));
      }}
      onClose={() => setMatching(null)}
    />
  ) : null;
  if (data.count === 0 && data.items.length === 0) return matchDialog;

  return (
    <section aria-label={`${UNMATCHED.TITLE} (${data.count})`} className="flex flex-col gap-2">
      <h3 id={headingId} className={TYPE.title}>
        {UNMATCHED.TITLE} <span className={`${TYPE.meta} ${NUM}`}>{data.count}</span>
      </h3>
      <ListCard
        label={UNMATCHED.TITLE}
        footer={
          data.next || more === 'failed' ? (
            <>
              {more === 'failed' ? (
                <p role="alert" className="text-[11px] leading-4 text-danger-ink">
                  {UNMATCHED.LOAD}
                </p>
              ) : null}
              <button type="button" aria-disabled={more === 'busy' || undefined} onClick={() => void showMore()} className={QUIET}>
                {UNMATCHED.MORE}
              </button>
            </>
          ) : undefined
        }
      >
        {data.items.map((item) => {
          const expanded = open.has(item.id);
          const long = isLong(item.text);
          return (
            <li key={item.id} data-item={`unmatched:${item.id}`} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`${TYPE.body} font-semibold`}>{item.title}</p>
                {item.priority === 'critical' ? <Badge tone="danger">Critical</Badge> : null}
              </div>
              <p className={TYPE.meta}>{metaLine(item)}</p>
              <p className={`${TYPE.bodyMuted} whitespace-pre-line ${long && !expanded ? 'line-clamp-3' : ''}`.trim()}>{item.text}</p>
              {long ? (
                <div>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpen((cur) => {
                        const next = new Set(cur);
                        if (expanded) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                    className={QUIET}
                  >
                    {expanded ? UNMATCHED.SHOW_LESS : UNMATCHED.SHOW_ALL}
                  </button>
                </div>
              ) : null}
              <p className={TYPE.meta}>{deletesText(item.deletes_on)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setMatching(item)} className={BUTTON}>
                  {UNMATCHED.MATCH}
                </button>
                <button type="button" onClick={() => setDismissing(item)} className={QUIET}>
                  {UNMATCHED.DISMISS}
                </button>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className={OPEN_LINK}>
                    {openText(item.source)}
                    <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ListCard>
      {matchDialog}
      {dismissing ? (
        <ConfirmDialog title={UNMATCHED.DISMISS_TITLE} message={UNMATCHED.DISMISS_MESSAGE} confirmLabel={UNMATCHED.DISMISS} busyLabel={UNMATCHED.DISMISSING} onConfirm={() => dismiss(dismissing)} onClose={() => setDismissing(null)} />
      ) : null}
    </section>
  );
}

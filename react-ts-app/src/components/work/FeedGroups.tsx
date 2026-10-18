import { useEffect, useRef } from 'react';
import { FEED, FEED_GROUP_LABEL, GROUP_ORDER, failedText, groupIn, type FailedSlot } from '../../features/work/feed';
import { moreRowsText } from '../../features/work/workText';
import type { FeedGroupKey, FeedPayload } from '../../features/work/workTypes';
import { BUTTON, Card, ListCard, NUM, QUIET, TYPE } from '../ui';
import { FeedRow, type FeedRowProps } from './FeedRow';

export type Handlers = Pick<FeedRowProps, 'onDone' | 'onSettled' | 'onGone' | 'onLost' | 'onAnswered'>;

/** A failed source's notice in its group's place (Decision 4), with Try
 *  again (aria-disabled while its read runs, so focus stays). */
export function FailedNotice({ slot, busy, onRetry }: { slot: FailedSlot; busy: boolean; onRetry: (slot: FailedSlot) => void }) {
  return (
    <Card pad="none">
      <div data-failed={slot.at} role="alert" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className={`${TYPE.body} text-danger-ink`}>{failedText(slot.kinds)}</p>
        <button type="button" onClick={() => !busy && onRetry(slot)} aria-disabled={busy || undefined} className={BUTTON}>
          {FEED.TRY_AGAIN}
        </button>
      </div>
    </Card>
  );
}

/** The feed's groups in the contract's order (spec §5): a failed source's
 *  notice in its place (Decision 4), then each group that has items (or
 *  more on the server), its count in the heading, Show more while the
 *  server has more. Try again and
 *  Show more are aria-disabled while their read runs, so focus stays.
 *  When Show more's page lands, focus moves to its first new row (made
 *  focusable for that, as the toast's text is), not to the body.
 *  My work passes nothing; the Team queue passes its three groups, its labels
 *  and `h3` (its section owns the `h2`). */
export function FeedGroups({
  order = GROUP_ORDER,
  labels = FEED_GROUP_LABEL,
  heading: Heading = 'h2',
  idPrefix = 'work-feed',
  data,
  slots,
  paging,
  isSm,
  me,
  pending,
  errors,
  onMore,
  onRetry,
  handlers,
}: {
  order?: readonly FeedGroupKey[];
  labels?: Record<FeedGroupKey, string>;
  heading?: 'h2' | 'h3';
  idPrefix?: string;
  data: FeedPayload;
  slots: FailedSlot[];
  paging: Partial<Record<FeedGroupKey, 'busy' | string>>;
  isSm: boolean;
  me: number | null;
  pending: ReadonlySet<string>;
  errors: Record<string, string>;
  onMore: (group: FeedGroupKey, cursor: string) => void;
  onRetry: (slot: FailedSlot) => void;
  handlers: Handlers;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Show more pressed: the group, and the rows it showed then (by key), so
  // rows that leave or arrive meanwhile cannot shift where focus lands.
  const landing = useRef<{ group: FeedGroupKey; known: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    const wanted = landing.current;
    if (!wanted || paging[wanted.group] === 'busy') return;
    landing.current = null;
    if (paging[wanted.group]) return;
    const first = groupIn(data, wanted.group).items.find((item) => !wanted.known.has(item.key));
    const root = rootRef.current;
    const row = first ? root?.querySelector<HTMLElement>(`[data-item="${CSS.escape(first.key)}"]`) : null;
    if (row) {
      row.tabIndex = -1;
      // Focusable only for this move: a later click in the row is not a row focus.
      row.addEventListener('blur', () => row.removeAttribute('tabindex'), { once: true });
      row.focus();
    } else if (!root?.contains(document.activeElement)) {
      // An empty page took Show more away: the group's heading keeps the place.
      const heading = root?.querySelector<HTMLElement>(`#${CSS.escape(`${idPrefix}-${wanted.group}`)}`);
      if (heading) {
        heading.tabIndex = -1;
        heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
        heading.focus();
      }
    }
  }, [data, paging, idPrefix]);

  return (
    <div ref={rootRef} className="contents">
      {order.map((key) => {
        const group = groupIn(data, key);
        const slot = slots.find((candidate) => candidate.at === key);
        const state = paging[key];
        const busy = state === 'busy';
        const headingId = `${idPrefix}-${key}`;
        const more = moreRowsText(group.items.length, group.count);
        // A group whose loaded rows all left stays while the server has more:
        // a decided review or question reads nothing again, so Show more is
        // the only way to the rest.
        const shown = group.items.length > 0 ? group.count > 0 : group.next !== null;
        if (!slot && !shown) return null;
        return (
          <div key={key} className="flex flex-col gap-2">
            {slot ? <FailedNotice slot={slot} busy={busy} onRetry={onRetry} /> : null}
            {shown ? (
              <section data-group={key} aria-labelledby={headingId} className="flex flex-col gap-2">
                <Heading id={headingId} className={TYPE.title}>
                  {labels[key]} <span className={`${TYPE.meta} ${NUM}`}>{group.count}</span>
                </Heading>
                <ListCard
                  label={labels[key]}
                  busy={busy}
                  footer={
                    group.next || (state && !busy) ? (
                      <>
                        {more ? <p className={`${TYPE.meta} ${NUM}`}>{more}</p> : null}
                        {state && !busy ? (
                          <p role="alert" className="text-[11px] leading-4 text-danger-ink">
                            {state}
                          </p>
                        ) : null}
                        {group.next ? (
                          <button type="button" aria-disabled={busy || undefined} onClick={() => {
                              if (busy) return;
                              landing.current = { group: key, known: new Set(group.items.map((item) => item.key)) };
                              onMore(key, group.next as string);
                            }} className={QUIET}>
                            {busy ? FEED.LOADING_MORE : FEED.SHOW_MORE}
                          </button>
                        ) : null}
                      </>
                    ) : undefined
                  }
                >
                  {group.items.map((item) => (
                    <FeedRow
                      key={item.key}
                      item={item}
                      group={key}
                      isSm={isSm}
                      me={me}
                      busy={pending.has(item.key)}
                      error={errors[item.key] ?? null}
                      {...handlers}
                    />
                  ))}
                </ListCard>
              </section>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

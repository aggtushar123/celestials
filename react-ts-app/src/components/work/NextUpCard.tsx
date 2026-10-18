import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FEED, NEXT_UP, NEXT_UP_KINDS, nextUp, reopenedText, undoPatch } from '../../features/work/feed';
import { fetchFeed, isMissing, patchTask } from '../../features/work/workApi';
import { WORK, doneStatus } from '../../features/work/workText';
import type { FeedItem, FeedPayload, QuestionFeedItem, TaskFeedItem } from '../../features/work/workTypes';
import { useAppSelector } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { EmptyState, ErrorState, ListCard, LoadingState, NUM, TYPE } from '../ui';
import { LINK } from '../brain/styles';
import type { Settle } from './FeedDecideRows';
import { FeedRow } from './FeedRow';
import { taskChanged, useTaskChanges } from './taskChanges';
import { useFeedSettle } from './useFeedSettle';
import { WorkToast } from './WorkToast';

/** Copilot's Next up (spec §5 Copilot; frontend Decision 7): the first five
 *  of what waits on the reader (decide, bundles first, each with Review, which
 *  opens it on Work; then overdue, then today), acted on
 *  in place with My work's rows; a question answered inline. A row that
 *  leaves says so in My work's toast (useFeedSettle, WorkToast), which takes
 *  focus and offers the same Undo: Done for 7 days of reopening, Apply while
 *  the action's undo window is open. It reads the feed again after every
 *  action and every task change. Its failure is its own (Try again), never
 *  the Cockpit's. One card: the heading row is the list card's header, so
 *  there is no card in a card. */
export function NextUpCard() {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const isSm = useMediaQuery(SM);
  const [attempt, setAttempt] = useState(0);
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const running = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchFeed(NEXT_UP_KINDS).then(
      (payload) => {
        if (!alive) return;
        setFeed(payload);
        setError(null);
      },
      (err: unknown) => alive && setError(errorMessage(err, NEXT_UP.LOAD)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useTaskChanges(reload);
  const update = useCallback((change: (current: FeedPayload) => FeedPayload) => setFeed((current) => (current ? change(current) : current)), []);
  const settle = useFeedSettle(update);

  // Every row that leaves: My work's toast, then a fresh read for the next five.
  const leave = (item: FeedItem, done: Settle, undo?: () => Promise<void>) => {
    settle.leave(item, done, undo);
    reload();
  };
  const handlers = {
    onSettled: (item: FeedItem, done: Settle) => leave(item, done),
    onGone: (item: FeedItem, text: string) => leave(item, { text }),
    onLost: (item: FeedItem, text: string) => {
      settle.lost(item, text);
      reload();
    },
    onAnswered: (item: QuestionFeedItem, done: Settle) => leave(item, done),
  };

  async function done(item: TaskFeedItem) {
    if (running.current) return;
    running.current = true;
    setBusyKey(item.key);
    try {
      await patchTask(item.id, { status: 'completed' });
      // taskChanged() below reads the feed again (useTaskChanges).
      settle.leave(item, { text: doneStatus(item.title) }, async () => {
        try {
          await patchTask(item.id, undoPatch(item.detail));
          settle.say({ text: reopenedText(item.title) });
          taskChanged();
        } catch (err) {
          settle.say({ text: errorMessage(err, FEED.UNDO_FAILED) });
        }
      });
      taskChanged();
    } catch (err) {
      if (isMissing(err)) handlers.onLost(item, FEED.LOST);
      else settle.say({ text: errorMessage(err, WORK.DONE_FAILED) });
    } finally {
      running.current = false;
      setBusyKey(null);
    }
  }

  // Close with the row gone: the first control left in the card, else Open Work.
  const focusCard = () => {
    const card = sectionRef.current;
    (card?.querySelector<HTMLElement>('li[data-item] a, li[data-item] button') ?? card?.querySelector<HTMLElement>('a[href="/work"]'))?.focus();
  };

  const shown = feed ? nextUp(feed) : null;
  let state: ReactNode = null;
  if (!feed && error) state = <ErrorState message={error} onRetry={reload} />;
  else if (!feed) state = <LoadingState label={NEXT_UP.LOADING} count={3} />;
  else if (shown && shown.items.length === 0) state = <EmptyState size="inline" title={FEED.EMPTY_TITLE} />;

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
      <h2 id={titleId} className={TYPE.title}>
        {NEXT_UP.TITLE} {shown ? <span className={`${TYPE.meta} ${NUM}`}>{shown.total}</span> : null}
      </h2>
      <Link to="/work" className={LINK}>
        {NEXT_UP.OPEN_WORK}
      </Link>
    </div>
  );

  return (
    <section ref={sectionRef} aria-labelledby={titleId} className="flex flex-col gap-2">
      <ListCard label={NEXT_UP.TITLE} header={header} state={state}>
        {shown?.items.map(({ group, item }) => (
          <FeedRow
            key={item.key}
            item={item}
            group={group}
            isSm={isSm}
            me={me}
            busy={busyKey === item.key}
            error={null}
            onDone={(task) => void done(task)}
            {...handlers}
          />
        ))}
      </ListCard>
      {/* As on My work: room under the card so the fixed toast never covers its last row. */}
      {settle.toast ? <div aria-hidden="true" data-part="toast-room" className="h-32 shrink-0 sm:h-20" /> : null}
      <WorkToast toast={settle.toast} onClose={settle.close} fallbackFocus={focusCard} />
    </section>
  );
}

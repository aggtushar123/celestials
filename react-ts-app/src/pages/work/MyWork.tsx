import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Settings as Gear } from 'lucide-react';
import { FeedGroups } from '../../components/work/FeedGroups';
import { YourTodos } from '../../components/work/BriefLists';
import { PriorityBanner } from '../../components/work/PriorityBanner';
import { ReadyToRun } from '../../components/work/ReadyToRun';
import { WorkBrief } from '../../components/work/WorkBrief';
import { useBriefFeed } from '../../components/work/useBriefFeed';
import { FeedSkeleton } from '../../components/work/FeedSkeleton';
import { KindChips } from '../../components/work/KindChips';
import { QuickAdd } from '../../components/work/QuickAdd';
import { taskChanged, useTaskChanges, useTodoAdded } from '../../components/work/taskChanges';
import { useFeed } from '../../components/work/useFeed';
import { useFeedSettle } from '../../components/work/useFeedSettle';
import { WorkToast } from '../../components/work/WorkToast';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { Card, EmptyState, ErrorState, ICON_BUTTON, PageHeaderActions, QUIET, TYPE } from '../../components/ui';
import {
  FEED,
  addedText,
  chipAllows,
  chipOf,
  emptyTitle,
  failedSlots,
  feedTotal,
  groupIn,
  hiddenFeedText,
  locateItem,
  reopenedText,
  undoPatch,
  withItem,
} from '../../features/work/feed';
import { isMissing, patchTask } from '../../features/work/workApi';
import { WORK, doneStatus } from '../../features/work/workText';
import type { TaskFeedItem, TodoAnswer } from '../../features/work/workTypes';
import { useAppSelector, useCapability } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';

const READY_ID = 'work-brief-ready';
const TODOS_ID = 'work-brief-todos';

/** /work?queue=mine (spec §5): everything waiting on the reader, one feed in eight
 *  groups, decisions first. Quick-add on top, kind chips in the URL, inline
 *  actions; a row that leaves says so in the toast, with Undo where one
 *  exists. A failed source shows in its place; the rest still renders.
 *  With no kind chip it is Work home's daily brief (owner, 2026-10-17): a
 *  greeting, the summary and tiles, Ready to run, then Your to-dos beside
 *  Suggested; a chip shows that kind's plain grouped list. */
/** `boxInPane`: Work's right pane holds the quick-add box (from lg,
 *  owner 2026-10-16), so the list shows none of its own. */
export function MyWorkPage({ boxInPane = false }: { boxInPane?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const chip = chipOf(params.get('kind'));
  // The chip at the time an Undo lands, not when its Done was sent.
  const chipNow = useRef(chip);
  chipNow.current = chip;
  const addRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const feed = useFeed(chip);
  useTaskChanges(feed.reload);
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  // Work home (owner, 2026-10-17): with no kind chip, Mine is the daily brief.
  const brief = chip === null;
  // The three tiles stay the same on every chip (owner, 2026-10-18): with a
  // chip on they read the whole feed, not the narrowed list.
  const wholeFeed = useBriefFeed(!brief);
  const tilesData = brief ? feed.data : wholeFeed;
  const [pendingJump, setPendingJump] = useState<'ready' | 'todos' | null>(null);
  const canManage = useCapability('manage_org_settings');
  const isSm = useMediaQuery(SM);
  // Rows whose Done is being sent, by key: a second Done on the same row is
  // dropped (the ref is set before React re-renders).
  const running = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const settle = useFeedSettle(feed.update);
  const data = feed.data;

  function showAll() {
    const query = new URLSearchParams(params);
    query.delete('kind');
    setParams(query, { replace: true });
  }

  /** A brief tile's jump: its section's heading scrolls into view and takes
   *  focus. With a kind chip on, the sections aren't drawn: the chip is
   *  cleared first and the jump runs once the brief is back. */
  function jump(to: 'ready' | 'todos') {
    if (chip !== null) {
      setPendingJump(to);
      showAll();
      return;
    }
    const heading = document.getElementById(to === 'ready' ? READY_ID : TODOS_ID);
    if (!heading) return;
    heading.scrollIntoView?.({ block: 'start' });
    heading.tabIndex = -1;
    heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
    heading.focus();
  }

  useEffect(() => {
    if (pendingJump === null || !brief || !feed.data) return;
    setPendingJump(null);
    requestAnimationFrame(() => jump(pendingJump));
    // jump reads only the DOM; it runs once the brief's sections are drawn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, brief, feed.data]);

  const track = (key: string, on: boolean) => {
    if (on) running.current.add(key);
    else running.current.delete(key);
    setPending(new Set(running.current));
  };

  async function markDone(item: TaskFeedItem) {
    if (running.current.has(item.key)) return;
    const where = data ? locateItem(data, item.key) : null;
    track(item.key, true);
    setErrors((current) => {
      const next = { ...current };
      delete next[item.key];
      return next;
    });
    try {
      await patchTask(item.id, { status: 'completed' });
      settle.leave(item, { text: doneStatus(item.title) }, async () => {
        try {
          await patchTask(item.id, undoPatch(item.detail));
          if (where && chipAllows(chipNow.current, item.kind)) feed.update((current) => withItem(current, where.group, item));
          settle.say({ text: reopenedText(item.title) });
          taskChanged();
        } catch (err) {
          settle.say({ text: errorMessage(err, FEED.UNDO_FAILED) });
        }
      });
      taskChanged();
    } catch (err) {
      if (isMissing(err)) settle.lost(item, FEED.LOST);
      else setErrors((current) => ({ ...current, [item.key]: errorMessage(err, WORK.DONE_FAILED) }));
    } finally {
      track(item.key, false);
    }
  }

  // Quick-add (contract Decision 15, ruling R8): QuickAdd already fired
  // feedChanged() for the badge; the page only places the answered item and
  // does not read the feed again, unless a load already on its way was read
  // before the add (`place`). Focus stays in the box (Decision 1).
  function added(answer: TodoAnswer) {
    if (answer.item && answer.group && chipAllows(chip, answer.item.kind)) {
      const { item, group } = answer;
      feed.place((current) => withItem(current, group, item));
    }
    settle.say({ text: addedText(answer) }, false);
  }
  useTodoAdded(added);

  let body: ReactNode;
  if (!data && feed.error) {
    body = (
      <Card pad="none">
        <ErrorState message={feed.error} onRetry={feed.reload} />
      </Card>
    );
  } else if (!data) {
    body = <FeedSkeleton />;
  } else {
    const slots = failedSlots(data.failed);
    const handlers = { onDone: (item: TaskFeedItem) => void markDone(item), onSettled: settle.leave, onGone: settle.gone, onLost: settle.lost, onAnswered: settle.leave };
    const shared = { isSm, me, pending, errors, onRetry: feed.retry, handlers };
    body = brief ? (
      <>
        <PriorityBanner items={groupIn(data, 'decide').items} />
        <ReadyToRun
          id={READY_ID}
          group={groupIn(data, 'decide')}
          slot={slots.find((slot) => slot.at === 'decide') ?? null}
          paging={feed.paging.decide}
          onMore={(cursor) => void feed.showMore('decide', cursor)}
          {...shared}
        />
        {/* Suggestions live on their own chip (owner, 2026-10-18): the brief
            ends with your to-dos, full width. */}
        <YourTodos id={TODOS_ID} data={data} slots={slots} paging={feed.paging} onMore={(group, cursor) => void feed.showMore(group, cursor)} {...shared} />
      </>
    ) : feedTotal(data) === 0 && slots.length === 0 ? (
        <Card pad="none">
          {chip ? (
            <EmptyState
              title={emptyTitle(chip)}
              action={
                <button
                  type="button"
                  onClick={() => {
                    showAll();
                    // The button leaves with the empty state: focus goes to the All chip.
                    requestAnimationFrame(() => chipsRef.current?.querySelector<HTMLElement>('button')?.focus());
                  }}
                  className={QUIET}
                >
                  {FEED.SHOW_ALL}
                </button>
              }
            />
          ) : (
            <EmptyState title={FEED.EMPTY_TITLE} detail={FEED.EMPTY_DETAIL} />
          )}
        </Card>
      ) : (
        <FeedGroups
          data={data}
          slots={slots}
          paging={feed.paging}
          isSm={isSm}
          me={me}
          pending={pending}
          errors={errors}
          onMore={(group, cursor) => void feed.showMore(group, cursor)}
          onRetry={feed.retry}
          handlers={handlers}
        />
      );
  }
  const hidden = data ? hiddenFeedText(data.hidden) : null;

  return (
    <>
      {canManage ? (
        <PageHeaderActions>
          <Link to="/settings/work" aria-label={FEED.SETTINGS} className={ICON_BUTTON}>
            <Gear className="h-5 w-5" aria-hidden="true" />
          </Link>
        </PageHeaderActions>
      ) : null}
      {tilesData ? <WorkBrief data={tilesData} onJump={jump} summary={brief} /> : null}
      {/* From lg the box is in Work's right pane, above Ask Revenact (owner, 2026-10-16). */}
      {boxInPane ? null : (
        <div ref={addRef}>
          <QuickAdd onAdded={added} />
        </div>
      )}
      <KindChips queue="mine" rowRef={chipsRef} />
      {body}
      {hidden ? <p className={TYPE.bodyMuted}>{hidden}</p> : null}
      {/* The toast is fixed over the bottom and never hides by itself: room
          under the last row lets it scroll clear (a phone toast may wrap to
          two lines of 44px controls). */}
      {settle.toast ? <div aria-hidden="true" data-part="toast-room" className="h-32 shrink-0 sm:h-20" /> : null}
      <WorkToast toast={settle.toast} onClose={settle.close} fallbackFocus={() => (addRef.current ?? document.querySelector('[data-part="work-pane"]'))?.querySelector('input')?.focus()} />
    </>
  );
}

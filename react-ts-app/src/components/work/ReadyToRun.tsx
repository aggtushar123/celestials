import { useId, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { shortStepLabel } from '../../features/agents/agentsText';
import { BUNDLE } from '../../features/agents/bundleText';
import { BRIEF, FEED, bundleHref, bundleSourceText, showAllCountText, stepChain, type FailedSlot } from '../../features/work/feed';
import type { BundleFeedItem, FeedGroup } from '../../features/work/workTypes';
import { GUIDED, prioritySort } from '../../features/agents/guidedText';
import { BUTTON, Badge, ListCard, NUM, PRIMARY, QUIET, TYPE } from '../ui';
import { FailedNotice, type Handlers } from './FeedGroups';
import { FeedRow } from './FeedRow';
import { CHANNEL_ICON, FeedRowMeta, KIND_ICON, MEETING_ICON, ROW_FOCUS } from './FeedRowParts';
import { OPENED_HERE } from './useTaskLink';

/** How many rows Ready to run shows before "Show all". */
export const READY_CAP = 5;

/** A waiting bundle as Ready to run draws it (Work home, 2026-10-17): its
 *  title, the meta line with where it came from, the chain of its waiting
 *  steps as chips, and Review & run, which opens the panel (`?bundle=`).
 *  `primary`: the first row's button, the surface's one primary. */
export function BriefBundleRow({ item, primary }: { item: BundleFeedItem; primary: boolean }) {
  const titleId = useId();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const d = item.detail;
  const slack = d.source.kind === 'slack_message';
  const meeting = d.source.kind === 'meeting';
  const Icon = d.source.channel ? CHANNEL_ICON[d.source.channel] : slack ? KIND_ICON.slack_message : meeting ? MEETING_ICON : KIND_ICON.bundle;
  const chain = stepChain(d.kinds.map(shortStepLabel));
  const label = d.can_run ? BRIEF.REVIEW_RUN : BUNDLE.REVIEW;
  return (
    <li data-item={item.key} data-part="ready-bundle" className={`flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={titleId} className={`${TYPE.body} max-w-[68ch] break-words font-semibold`}>
              {item.title}
            </h3>
            {d.priority === 'high' ? <Badge tone="warning">{GUIDED.PRIORITY}</Badge> : null}
          </div>
          <FeedRowMeta item={{ ...item, private: item.private || slack || meeting }} group="decide" extra={<span data-part="source">{bundleSourceText(d.source)}</span>} />
          {chain.shown.length > 0 ? (
            <ol aria-label={BRIEF.STEPS} className="flex flex-wrap items-center gap-1">
              {chain.shown.map((step, index) => (
                <li key={`${index}-${step}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-faint" /> : null}
                  <span className={`rounded-full bg-subtle px-2 ${TYPE.meta}`}>{step}</span>
                </li>
              ))}
              {chain.more > 0 ? (
                <li className={`px-1 ${TYPE.meta} ${NUM}`}>+{chain.more}</li>
              ) : null}
            </ol>
          ) : null}
        </div>
        <Link
          to={bundleHref(pathname, params, item.id)}
          state={OPENED_HERE}
          aria-label={`${label} ${item.title}`}
          className={`${primary ? PRIMARY : BUTTON} shrink-0 self-start sm:self-center`}
        >
          {label}
        </Link>
      </article>
    </li>
  );
}

/** Ready to run (Work home): the `decide` group. Bundles draw as
 *  BriefBundleRow, every other kind keeps its own row. At most five, then
 *  Show all expands in place; Show more pages while the server has more.
 *  Priority bundles lead, each with its Priority badge. */
export function ReadyToRun({
  id,
  group,
  slot,
  paging,
  isSm,
  me,
  pending,
  errors,
  onMore,
  onRetry,
  handlers,
}: {
  id: string;
  group: FeedGroup;
  slot: FailedSlot | null;
  paging: 'busy' | string | undefined;
  isSm: boolean;
  me: number | null;
  pending: ReadonlySet<string>;
  errors: Record<string, string>;
  onMore: (cursor: string) => void;
  onRetry: (slot: FailedSlot) => void;
  handlers: Handlers;
}) {
  const [expanded, setExpanded] = useState(false);
  const busy = paging === 'busy';
  // Priority bundles first, in the server's order otherwise (guided agent, 2026-10-18).
  const items = prioritySort(group.items);
  const shown = expanded ? items : items.slice(0, READY_CAP);
  // Show all reveals the rows already loaded past the fifth; Show more pages from the server.
  const capped = !expanded && items.length > READY_CAP;
  const more = () => {
    setExpanded(true);
    if (!busy && group.next) onMore(group.next);
  };
  const firstBundle = shown[0]?.kind === 'bundle' ? shown[0].key : null;
  return (
    <section aria-labelledby={id} data-part="ready" className="flex scroll-mt-4 flex-col gap-2">
      <h2 id={id} className={TYPE.title}>
        {BRIEF.READY} <span className={`${TYPE.meta} ${NUM}`}>{group.count}</span>
      </h2>
      {slot ? <FailedNotice slot={slot} busy={busy} onRetry={onRetry} /> : null}
      {shown.length === 0 && !group.next ? (
        slot ? null : <p className={TYPE.bodyMuted}>{BRIEF.NOTHING_WAITS}</p>
      ) : (
        <ListCard
          label={BRIEF.READY}
          busy={busy}
          footer={
            capped ? (
              <button type="button" onClick={() => setExpanded(true)} className={QUIET}>
                <span className={NUM}>{showAllCountText(group.count)}</span>
              </button>
            ) : group.next ? (
              <button type="button" aria-disabled={busy || undefined} onClick={more} className={QUIET}>
                {busy ? FEED.LOADING_MORE : FEED.SHOW_MORE}
              </button>
            ) : paging && !busy ? (
              <p role="alert" className="text-[11px] leading-4 text-danger-ink">
                {paging}
              </p>
            ) : undefined
          }
        >
          {shown.map((item) =>
            item.kind === 'bundle' ? (
              <BriefBundleRow key={item.key} item={item} primary={item.key === firstBundle} />
            ) : (
              <FeedRow key={item.key} item={item} group="decide" isSm={isSm} me={me} busy={pending.has(item.key)} error={errors[item.key] ?? null} {...handlers} />
            ),
          )}
        </ListCard>
      )}
    </section>
  );
}

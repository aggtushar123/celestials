import { useId } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BUNDLE, routedText, stepCountText } from '../../features/agents/bundleText';
import { bundleHref } from '../../features/work/feed';
import type { BundleFeedItem, FeedGroupKey } from '../../features/work/workTypes';
import { GUIDED } from '../../features/agents/guidedText';
import { BUTTON, Badge, NUM, TYPE } from '../ui';
import { CHANNEL_ICON, FeedRowMeta, KIND_ICON, MEETING_ICON, ROW_FOCUS } from './FeedRowParts';
import { OPENED_HERE } from './useTaskLink';

/** A waiting bundle (spec §8.1 list; frontend Decision 4): its title, why,
 *  the kinds of its waiting steps, the meta line and Review, which opens the
 *  panel over the list (`?bundle=`, pushed so Back closes it). */
export function BundleRow({ item, group }: { item: BundleFeedItem; group: FeedGroupKey }) {
  const titleId = useId();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const d = item.detail;
  const channel = d.source.channel;
  // Slack bundles: a Slack message's bundle is its sender's alone.
  const slack = d.source.kind === 'slack_message';
  // Sales review report: a meeting's bundle is its organiser's alone.
  const meeting = d.source.kind === 'meeting';
  const Icon = channel ? CHANNEL_ICON[channel] : slack ? KIND_ICON.slack_message : meeting ? MEETING_ICON : KIND_ICON.bundle;
  const labelled = Boolean(channel) || slack || meeting;
  // A routed row says where it waits from its own routing, in place of "For <owner>".
  const routed = routedText(d);
  const shown = { ...item, ...(routed ? { for: undefined } : {}), private: item.private || slack || meeting };
  return (
    <li data-item={item.key} className={`flex items-start gap-3 px-4 py-3 ${ROW_FOCUS}`}>
      <Icon data-channel={channel ?? undefined} className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={titleId} className={`${TYPE.body} break-words font-semibold`}>
            {item.title}
          </h3>
          {d.priority === 'high' ? <Badge tone="warning">{GUIDED.PRIORITY}</Badge> : null}
        </div>
        {d.reason ? <p className={`max-w-[68ch] ${TYPE.bodyMuted}`}>{d.reason}</p> : null}
        {d.kinds.length > 0 ? <p className={TYPE.body}>{d.kinds.join(' · ')}</p> : null}
        <FeedRowMeta
          item={shown}
          group={group}
          extra={
            <>
              {routed ? <span data-part="for">{routed}</span> : null}
              {routed ? <span aria-hidden="true"> · </span> : null}
              {labelled ? <span>{d.source.label}</span> : null}
              {labelled ? <span aria-hidden="true"> · </span> : null}
              <span className={NUM}>{stepCountText(d.step_count)}</span>
            </>
          }
        />
        <Link to={bundleHref(pathname, params, item.id)} state={OPENED_HERE} aria-label={`${BUNDLE.REVIEW} ${item.title}`} className={`${BUTTON} self-start`}>
          {BUNDLE.REVIEW}
        </Link>
      </article>
    </li>
  );
}

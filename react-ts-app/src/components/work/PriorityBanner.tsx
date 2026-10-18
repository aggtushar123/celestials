import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { GUIDED, priorityText } from '../../features/agents/guidedText';
import { bundleHref } from '../../features/work/feed';
import type { BundleFeedItem, FeedItem } from '../../features/work/workTypes';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { BUTTON, Banner } from '../ui';
import { OPENED_HERE } from './useTaskLink';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const isPriority = (item: FeedItem): item is BundleFeedItem => item.kind === 'bundle' && item.detail.priority === 'high';

/** Work home's priority line (guided agent, 2026-10-18), above Ready to
 *  run: "Priority: <title>" and Open, which opens the bundle. A priority
 *  bundle that arrives while Work is open takes the line and fades up once
 *  (200ms; none under reduced motion). It never hides by itself. */
export function PriorityBanner({ items }: { items: readonly FeedItem[] }) {
  const reduced = useMediaQuery(REDUCED_MOTION);
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const high = items.filter(isPriority);
  const keys = high.map((item) => item.key).join(' ');
  // The keys as last drawn, and the newest one that arrived since the first load.
  const [seen, setSeen] = useState(keys);
  const [fresh, setFresh] = useState<string | null>(null);
  if (keys !== seen) {
    const before = new Set(seen.split(' '));
    const added = high.find((item) => !before.has(item.key));
    setSeen(keys);
    if (added) setFresh(added.key);
  }
  const shown = high.find((item) => item.key === fresh) ?? high[0];
  if (!shown) return null;
  const animate = shown.key === fresh && !reduced;
  return (
    <div key={shown.key} data-part="priority-banner" data-fresh={shown.key === fresh || undefined} className={animate ? 'animate-fade-up' : undefined}>
      <Banner
        action={
          <Link to={bundleHref(pathname, params, shown.id)} state={OPENED_HERE} aria-label={`${GUIDED.OPEN} ${shown.title}`} className={BUTTON}>
            {GUIDED.OPEN}
          </Link>
        }
      >
        <span className="break-words">{priorityText(shown.title)}</span>
      </Banner>
    </div>
  );
}

import type { RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { QueueKey } from '../../features/agents/bundleTypes';
import { FEED, chipOf, type FeedChip } from '../../features/work/feed';
import { chipsFor } from '../../features/work/queues';
import { FilterChip, FilterChipRow } from '../ui';

/** The kind filters above a queue (spec §8.1), in the URL as `?kind=`. */
export function KindChips({ queue, rowRef }: { queue: QueueKey; rowRef?: RefObject<HTMLDivElement | null> }) {
  const [params, setParams] = useSearchParams();
  const chip = chipOf(params.get('kind'));
  const chips = chipsFor(queue);
  if (chips.length === 0) return null;
  const choose = (next: FeedChip | null) => {
    const query = new URLSearchParams(params);
    if (next) query.set('kind', next);
    else query.delete('kind');
    setParams(query, { replace: true });
  };
  return (
    <div ref={rowRef}>
      <FilterChipRow label={FEED.FILTER}>
        {chips.map((option) => (
          <FilterChip key={option.label} label={option.label} pressed={chip === option.key} onToggle={() => choose(option.key)} />
        ))}
      </FilterChipRow>
    </div>
  );
}

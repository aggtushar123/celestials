import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SM, useMediaQuery } from '../../../lib/useMediaQuery';
import { Card, CardHeader, FOCUS, NUM, TYPE } from '../../ui';
import { FilterButton } from './tileParts';

export interface BreakdownItem {
  value: string;
  label: string;
  count: number;
}

/** A breakdown of more than three rows, out of the tile row into its own
 *  card (UI foundations spec §4.3): each row a filter with a bar and its
 *  count. Open from sm; folded behind its title on a phone, so the list
 *  stays near the top. Lifecycle (Organizations, Accounts) and Stages
 *  (Pipelines). */
export function BreakdownCard({
  title,
  items,
  pressed,
  onToggle,
}: {
  title: string;
  items: BreakdownItem[];
  pressed: (value: string) => boolean;
  onToggle: (value: string) => void;
}) {
  const wide = useMediaQuery(SM);
  const [opened, setOpened] = useState(false);
  const bodyId = useId();
  const open = wide || opened;
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <Card pad="none">
      {wide ? (
        <CardHeader title={title} />
      ) : (
        <h2 className="m-0">
          <button
            type="button"
            aria-expanded={opened}
            aria-controls={opened ? bodyId : undefined}
            onClick={() => setOpened(!opened)}
            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 text-left ${TYPE.title} ${FOCUS}`}
          >
            {title}
            <ChevronDown className={`h-4 w-4 text-ink-muted ${opened ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </h2>
      )}
      {open ? (
        <div id={bodyId} className="px-4 pb-4">
          <div className="grid gap-x-6 sm:grid-cols-2 @min-[50rem]:grid-cols-4">
            {items.map((item) => (
              <FilterButton key={item.value} pressed={pressed(item.value)} onClick={() => onToggle(item.value)}>
                <span title={item.label} className="w-24 shrink-0 truncate text-left">
                  {item.label}
                </span>{' '}
                <span aria-hidden="true" className="mx-1 h-1 flex-1 rounded-full bg-line">
                  <span className="block h-full rounded-full bg-ink-muted" style={{ width: `${(item.count / max) * 100}%` }} />
                </span>
                <span className={`${NUM} text-ink`}>{item.count}</span>
              </FilterButton>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

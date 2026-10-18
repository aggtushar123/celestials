import { useMemo, useState } from 'react';
import type { HealthStatus } from '../../../../features/health/types';
import { useHealthOverview } from './useHealthOverview';
import { HealthEmpty, HealthError, HealthLoading, HealthTruncatedNotice } from './HealthDataState';
import { triage } from './triage';
import { TriageTiles } from './charts/TriageTiles';
import { TriageQueue } from './charts/TriageQueue';

const STATUSES: HealthStatus[] = ['Poor', 'Average', 'Good'];

const FILTER_ACTIVE: Record<HealthStatus, string> = {
  Poor: 'bg-danger-dim text-danger border-danger',
  Average: 'bg-warning-dim text-warning border-warning',
  Good: 'bg-success-dim text-success border-success',
};

/** Rows shown before the queue offers to expand. */
const INITIAL_LIMIT = 12;

/**
 * Health Overview as a work queue rather than a wall of charts.
 *
 * `ControlsView` (the Controls tab) answers "what does the book look like?"
 * with nine equally-weighted cards. This answers the other question a CSM
 * opens this screen with — "who do I call today, and why?" — by ranking the
 * same rows and demoting the charts to glyphs inside them. Neither replaces
 * the other; they're two tabs over one dataset.
 */
export function TriageView() {
  const [activeFilter, setActiveFilter] = useState<HealthStatus | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Pinned at mount: `triage` measures renewal proximity against this, and a
  // fresh `new Date()` on every render would make scores drift mid-session.
  const [now] = useState(() => new Date());

  const { rows, error, truncated, isInitialLoad, hasLoaded } = useHealthOverview();

  // A `truncated` book is a capped slice of a larger one — a drill from it
  // would only ever show *some* of the accounts behind a tile's number, so
  // every drill on this view is switched off rather than quietly lying.
  const drillable = !truncated;

  // Score the whole book once, then filter — so a row's rank is its rank in
  // the book, not a position that changes meaning when you narrow the view.
  const scored = useMemo(() => triage(rows, now), [rows, now]);

  const visible = useMemo(
    () => (activeFilter ? scored.filter((t) => t.row.healthStatus === activeFilter) : scored),
    [scored, activeFilter],
  );

  if (isInitialLoad) return <HealthLoading />;
  if (error) return <HealthError message={error} />;
  if (hasLoaded && rows.length === 0) return <HealthEmpty />;

  return (
    // No h-full here: the queue's horizontal scroll track computes its
    // vertical overflow to `auto` as well, so constraining this to the
    // viewport turns the card into a scroll box that hides its own rows.
    // Let the content set the height and leave scrolling to the page.
    <div className="w-full flex flex-col gap-4 pb-12">
      {truncated && <HealthTruncatedNotice />}
      <div className="flex items-center flex-wrap gap-2 px-2 min-h-[24px]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mr-1">
          Filter
        </span>
        {STATUSES.map((status) => {
          const on = activeFilter === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={on}
              onClick={() => setActiveFilter(on ? null : status)}
              className={`text-[11px] font-bold py-[3px] px-3 rounded-full border transition-colors ${
                on
                  ? FILTER_ACTIVE[status]
                  : 'border-line text-ink-muted hover:bg-subtle hover:text-ink'
              }`}
            >
              {status}
            </button>
          );
        })}
        {activeFilter && (
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className="text-[11px] font-bold text-ink-faint hover:text-ink transition-colors ml-1"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-[11px] text-ink-faint">
          Showing {visible.length} of {scored.length}
        </span>
      </div>

      <TriageTiles scored={scored} drillable={drillable} />

      <TriageQueue scored={visible} limit={expanded ? visible.length : INITIAL_LIMIT} />

      {visible.length > INITIAL_LIMIT && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[12px] font-bold text-accent hover:text-accent-hover transition-colors py-1 px-3"
          >
            {expanded
              ? 'Show top 12 only'
              : `Show all ${visible.length} accounts`}
          </button>
        </div>
      )}
    </div>
  );
}

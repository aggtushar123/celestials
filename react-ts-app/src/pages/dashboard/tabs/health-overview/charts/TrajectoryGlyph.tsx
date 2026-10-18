import type { HealthStatus } from '../mockData';

const STATUS_FILL: Record<HealthStatus, string> = {
  Good: 'bg-success',
  Average: 'bg-warning',
  Poor: 'bg-danger',
};

export interface TrajectoryGlyphProps {
  /** Health states oldest → newest. Renders an em dash when empty. */
  trail: HealthStatus[];
  /** Most recent months to draw. Accounts carry a year of history; a dozen
   *  blocks would not fit a table row, and the recent months are the ones a
   *  queue is sorted on. */
  months?: number;
}

/**
 * Three months of health history as one small run of blocks, oldest at the
 * left. The most recent month is drawn taller and at full strength so
 * *direction* reads without having to compare colours left to right.
 *
 * This is the whole of `HealthChangeOverTimeStacked` compressed into a row —
 * that chart shows the book's totals moving; this shows one account moving.
 */
export function TrajectoryGlyph({ trail, months = 3 }: TrajectoryGlyphProps) {
  const shown = months > 0 ? trail.slice(-months) : trail;

  if (shown.length === 0) {
    return (
      <span className="text-[11px] text-ink-faint" title="No pulse history recorded">
        —
      </span>
    );
  }

  const label = shown.join(' → ');

  return (
    <div className="flex items-center gap-[3px]" role="img" aria-label={`Trajectory: ${label}`} title={label}>
      {shown.map((status, i) => {
        const isLatest = i === shown.length - 1;
        return (
          <span
            key={i}
            className={`block w-[13px] rounded-[2.5px] ${STATUS_FILL[status]} ${
              isLatest ? 'h-[19px]' : 'h-[15px] opacity-50'
            }`}
          />
        );
      })}
    </div>
  );
}

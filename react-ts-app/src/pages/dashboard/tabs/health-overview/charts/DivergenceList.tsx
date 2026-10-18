import type { HealthStatus } from '../mockData';
import type { DivergenceRow } from '../divergence';

const STATUS_CHIP: Record<HealthStatus, string> = {
  Good: 'bg-success-dim text-success',
  Average: 'bg-warning-dim text-warning',
  Poor: 'bg-danger-dim text-danger',
};

const STATUS_DOT: Record<HealthStatus, string> = {
  Good: 'bg-success',
  Average: 'bg-warning',
  Poor: 'bg-danger',
};

export interface DivergenceListProps {
  title: string;
  /** One line on what a disagreement in this direction means. */
  caption: string;
  rows: DivergenceRow[];
  /** Which side is reading colder — sets the arrow's colour. Only the
   *  danger direction (the model seeing risk the CSM doesn't) is a status;
   *  the other direction is a category with no loss/gain of its own, so it
   *  stays ink rather than reaching for a colour that isn't in the rubric. */
  tone: 'danger' | 'ink';
  emptyMessage: string;
}

/**
 * One direction of disagreement, as a list you can work down.
 *
 * The scatter shows that disagreements exist and roughly where; this names
 * them, in the order you'd act on them. Renewal is on every row because a gap
 * on an account renewing in three weeks is a different problem from the same
 * gap with a year of runway.
 */
export function DivergenceList({ title, caption, rows, tone, emptyMessage }: DivergenceListProps) {
  const arrow = tone === 'danger' ? 'text-danger' : 'text-ink';

  return (
    <section className="flex flex-col">
      <header className="sticky top-0 z-10 bg-surface flex items-baseline justify-between gap-3 px-4 pt-3 pb-1">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{title}</h3>
        <span className="text-[11px] font-bold text-ink-muted tabular-nums">{rows.length}</span>
      </header>
      <p className="px-4 pb-2 text-[10.5px] text-ink-faint">{caption}</p>

      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[11.5px] text-ink-faint">{emptyMessage}</p>
      ) : (
        <ul role="list" className="flex flex-col">
          {rows.map(({ row, daysToRenewal }) => (
            <li
              key={row.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center
                         px-4 py-[6px] border-t border-line-subtle hover:bg-base transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[12px] font-semibold text-ink truncate">{row.account}</span>
                <span
                  className={`inline-flex items-center gap-[5px] shrink-0 rounded-full px-2 py-[1px]
                              text-[10px] font-bold ${STATUS_CHIP[row.healthStatus]}`}
                >
                  <span className={`w-[5px] h-[5px] rounded-full ${STATUS_DOT[row.healthStatus]}`} />
                  {row.healthStatus}
                </span>
              </div>
              <span className="text-[10.5px] text-ink-muted whitespace-nowrap tabular-nums">
                CSM {row.csmPulseScore} <span className={`font-bold ${arrow}`}>→</span> AI{' '}
                {row.aiPulseScore}
                {daysToRenewal !== null && (
                  <span className={daysToRenewal <= 90 ? 'text-danger font-bold' : 'text-ink-faint'}>
                    {/* A past renewal is overdue, not a countdown running
                        backwards — real books carry plenty of these. */}
                    {' '}· {daysToRenewal < 0 ? `${Math.abs(daysToRenewal)}d ago` : `${daysToRenewal}d`}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

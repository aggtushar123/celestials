import { useMemo, useState } from 'react';
import type { HealthDataRow } from '../../../../features/health/types';
import { useHealthOverview } from './useHealthOverview';
import { HealthEmpty, HealthError, HealthLoading, HealthTruncatedNotice } from './HealthDataState';
import { buildFlow, moveCounts, movedRows, netMovement, renewalBuckets, WINDOW_OPTIONS } from './movement';
import type { MoveCounts, WindowMonths } from './movement';
import { HealthFlowChart } from './charts/HealthFlowChart';
import { RenewalRunwayChart } from './charts/RenewalRunwayChart';
import { Kpi, KpiStrip } from '../../shared/Kpi';
import { useDrill } from '../../drill/useDrill';
import { fromHealthRows } from '../../drill/rows';
import { ChartLegend } from '../../shared/ChartLegend';
import { HEALTH_LEGEND } from '../../shared/chartPalette';

const DEFAULT_WINDOW: WindowMonths = 6;

/**
 * "N downgrade(s)"/"N upgrade(s)" for one row — how many of the tile's own
 * figure (which counts moves, not accounts) this particular account
 * accounts for. Summing this across a tile's drilled rows always equals the
 * figure itself: both come from `moveCounts`, never re-derived separately.
 */
function moveDetail(counts: Map<string, MoveCounts>, direction: keyof MoveCounts, noun: string) {
  return (row: HealthDataRow) => {
    const n = counts.get(row.id)?.[direction] ?? 0;
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
  };
}

/**
 * Health Overview read as movement rather than as a snapshot.
 *
 * Every other tab answers a question about now — who to call, where the team's
 * read is wrong, what the book looks like. This one answers which way it is
 * going, by counting the transitions between months instead of the totals
 * within them, and what is coming up for renewal while it does.
 */
export function MovementView() {
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(DEFAULT_WINDOW);
  // Pinned at mount so renewal buckets don't shift mid-session.
  const [now] = useState(() => new Date());
  const { open } = useDrill();

  const { rows, error, truncated, isInitialLoad, hasLoaded } = useHealthOverview();

  // A truncated book is a capped slice of a larger one — a drill from it
  // would only ever show *some* of the accounts a tile or chart segment
  // counted, so every drill on this view is switched off rather than
  // quietly lying.
  const drillable = !truncated;

  const flow = useMemo(() => buildFlow(rows, windowMonths), [rows, windowMonths]);
  const net = useMemo(() => netMovement(flow), [flow]);
  const buckets = useMemo(() => renewalBuckets(rows, now), [rows, now]);

  const first = flow.months[0];
  const last = flow.months[flow.months.length - 1];

  if (isInitialLoad) return <HealthLoading />;
  if (error) return <HealthError message={error} />;
  if (hasLoaded && rows.length === 0) return <HealthEmpty />;

  return (
    <div className="w-full flex flex-col gap-4 pb-12">
      {truncated && <HealthTruncatedNotice />}
      <div className="flex items-center flex-wrap gap-2 px-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mr-1">
          Window
        </span>
        {WINDOW_OPTIONS.map((months) => {
          const on = months === windowMonths;
          return (
            <button
              key={months}
              type="button"
              aria-pressed={on}
              onClick={() => setWindowMonths(months)}
              className={`text-[11px] font-bold py-[3px] px-3 rounded-full border transition-colors ${
                on
                  ? 'bg-accent-dim text-accent border-accent'
                  : 'border-line text-ink-muted hover:bg-subtle hover:text-ink'
              }`}
            >
              {months} months
            </button>
          );
        })}

        {first && last && (
          <span className="ml-auto text-[11px] text-ink-faint">
            {first.short} → {last.short} · {flow.tracked} accounts tracked
          </span>
        )}
      </div>

      <KpiStrip columns={3}>
        <Kpi
          label="Downgrades"
          value={String(net.declined)}
          detail="account-months lost a grade"
          tone="loss"
          onDrill={
            drillable
              ? (trigger) => {
                  const counts = moveCounts(rows, windowMonths);
                  open(
                    {
                      title: 'Downgrades',
                      figure: String(net.declined),
                      source: {
                        kind: 'rows',
                        rows: fromHealthRows(
                          movedRows(rows, windowMonths, 'declined'),
                          moveDetail(counts, 'declined', 'downgrade'),
                        ),
                      },
                    },
                    trigger,
                  );
                }
              : undefined
          }
        />
        <Kpi
          label="Upgrades"
          value={String(net.improved)}
          detail="account-months gained a grade"
          tone="gain"
          onDrill={
            drillable
              ? (trigger) => {
                  const counts = moveCounts(rows, windowMonths);
                  open(
                    {
                      title: 'Upgrades',
                      figure: String(net.improved),
                      source: {
                        kind: 'rows',
                        rows: fromHealthRows(
                          movedRows(rows, windowMonths, 'improved'),
                          moveDetail(counts, 'improved', 'upgrade'),
                        ),
                      },
                    },
                    trigger,
                  );
                }
              : undefined
          }
        />
        <Kpi
          label="Net movement"
          value={net.net > 0 ? `+${net.net}` : String(net.net)}
          detail={`${net.held} held steady across the window`}
          tone={net.net > 0 ? 'gain' : net.net < 0 ? 'loss' : 'neutral'}
        />
      </KpiStrip>

      <section className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 pt-3">
          <div>
            <h3 className="text-[13px] font-bold text-ink">Health transitions</h3>
            <p className="text-[11px] text-ink-faint mt-[1px]">
              Ribbon width is the number of accounts moving · faded ribbons held their grade
            </p>
          </div>
          <ChartLegend className="shrink-0" align="end" items={HEALTH_LEGEND} />
        </div>
        <div className="px-2 pb-3 pt-1">
          <HealthFlowChart flow={flow} />
        </div>
      </section>

      <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[340px] flex flex-col">
        <RenewalRunwayChart buckets={buckets} drillable={drillable} />
      </div>
    </div>
  );
}

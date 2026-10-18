import { useMemo } from 'react';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { HealthDataRow } from '../mockData';
import { buildFlow } from '../movement';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { CURSOR_FILL, HEALTH_COLORS, HEALTH_LEGEND, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';

/** "Jan" + "Jan 31, 2026" → "Jan '26": twelve months can cross a year end. */
function monthTick(short: string, label: string): string {
  const year = /(\d{4})\s*$/.exec(label)?.[1];
  return year ? `${short} '${year.slice(2)}` : short;
}

/** Bottom to top, so Good sits on top — matching the flow and runway charts. */
const STACK = ['Poor', 'Average', 'Good'] as const;

/**
 * The book's health month by month, read from each account's `history`.
 *
 * This used to invent its own numbers: a `baseTotal = 20 + i * 15` ramp times a
 * fixed 50/35/15 split, which drew the same up-and-to-the-right curve whatever
 * the data said. Its own comment gave the reason — the mock carried three
 * months of history, not twelve. It carries twelve now, so the chart reads it.
 *
 * Counts states, not moves. The Movement tab's flow chart is the companion to
 * this: a month where nine accounts fell and nine recovered looks identical
 * here and completely different there.
 */
export function HealthChangeOverTimeStacked({ data }: { data: HealthDataRow[] }) {
  const chartData = useMemo(
    () =>
      buildFlow(data).months.map((m) => ({
        name: monthTick(m.short, m.label),
        full: m.label,
        Good: m.counts.Good,
        Average: m.counts.Average,
        Poor: m.counts.Poor,
        total: m.total,
      })),
    [data],
  );

  return (
    <div className="w-full p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold text-ink">Account health change over time (monthly)</h3>
        <span className="text-[11px] text-ink-faint">
          {chartData.length} month{chartData.length === 1 ? '' : 's'} of recorded history
        </span>
      </div>
      <ChartLegend items={HEALTH_LEGEND} />

      {chartData.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No health history for the current selection.</p>
      ) : (
        <div className="w-full h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={chartMargin({ x: true, left: true })} barSize={28}>
              <XAxis
                {...AXIS_BASE}
                dataKey="name"
                {...categoryAxis(chartData.length)}
                padding={{ left: 10, right: 10 }}
                label={axisLabel('Month', 'x')}
              />
              <YAxis {...AXIS_BASE} width={32} allowDecimals={false} label={axisLabel('Accounts')} />
              <Tooltip
                cursor={{ fill: CURSOR_FILL }}
                // The axis is shortened to a month name so twelve of them fit;
                // the tooltip restores the month-end date they stand for.
                labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: 12 }}
              />

              {/* No total label: every account carries every month, so the
                  total is identical on all twelve bars whatever the filter.
                  The stacked split is what changes, read off the Y axis. */}
              {STACK.map((status) => (
                <Bar {...STATIC_SERIES} key={status} dataKey={status} stackId="health" fill={HEALTH_COLORS[status]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

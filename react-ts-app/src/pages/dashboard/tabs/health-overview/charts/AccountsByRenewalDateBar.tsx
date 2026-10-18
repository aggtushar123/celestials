import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import type { HealthDataRow, HealthStatus } from '../mockData';
import { renewalMonths } from '../movement';
import type { RenewalMonth } from '../movement';
import { HEALTH_STACK, emptyStackMarker, stackedTotalLabelList } from '../../../shared/stackedTotalLabel';
import { CURSOR_FILL, HEALTH_COLORS, HEALTH_LEGEND, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';
import { DrillTargets } from '../../../drill/DrillTargets';

/**
 * When the book comes up for renewal, and what state each account is in.
 *
 * This used to ignore `renewalDate` entirely: it listed twenty hardcoded months
 * from Mar 2026 to Jan 2028 and filled them from a fixed `randomVals` array
 * scaled by how many rows were selected, plus a flat "benchmark" line that
 * measured nothing. The field it is named after was never read.
 *
 * The benchmark line is gone rather than reimplemented — there is no target
 * renewal count in the data to draw one from, and a line with nothing behind it
 * is what this chart is being fixed for.
 */
export function AccountsByRenewalDateBar({
  data,
  drillable = true,
}: {
  data: HealthDataRow[];
  /** False when `data` is a truncated book — a drill from it would only ever
   *  show some of the accounts a segment counted. Defaults to `true` so
   *  every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  const months = useMemo(() => renewalMonths(data), [data]);
  const chartData = useMemo(
    () =>
      months.map((m) => ({
        name: m.short,
        full: m.label,
        Good: m.counts.Good,
        Average: m.counts.Average,
        Poor: m.counts.Poor,
        total: m.total,
      })),
    [months],
  );

  const busiest = useMemo(
    () => chartData.reduce<(typeof chartData)[number] | null>(
      (peak, m) => (peak === null || m.total > peak.total ? m : peak),
      null,
    ),
    [chartData],
  );

  const openSegment = (month: RenewalMonth, status: HealthStatus, trigger?: HTMLElement) => {
    const picked = month.rows[status];
    open(
      {
        title: `${month.label} · ${status}`,
        figure: String(picked.length),
        source: { kind: 'rows', rows: fromHealthRows(picked) },
      },
      trigger,
    );
  };

  // One button per month × status that actually has an account in it — a
  // keyboard user (and this chart's own test) can't reach a recharts <Bar>'s
  // SVG segments, so this is the real drill target; the Bar's own onClick
  // below is the pointer shortcut to the same thing. None at all when the
  // book is truncated — see `drillable`.
  const drillItems = drillable
    ? months.flatMap((month) =>
        HEALTH_STACK.filter((status) => month.rows[status].length > 0).map((status) => ({
          name: `${month.label} · ${status}`,
          figure: String(month.rows[status].length),
          onSelect: (trigger: HTMLElement) => openSegment(month, status, trigger),
        })),
      )
    : [];

  return (
    <div className="relative w-full p-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-bold text-ink">Accounts by renewal date (monthly)</h3>
        {busiest && busiest.total > 0 && (
          <span className="text-[11px] text-ink-faint">
            Busiest: {busiest.full} · {busiest.total} renewing
          </span>
        )}
      </div>
      <ChartLegend items={HEALTH_LEGEND} />

      <DrillTargets label="Accounts by renewal date" items={drillItems} />

      {chartData.length === 0 ? (
        <p className="text-[12px] text-ink-faint">No readable renewal dates for the current selection.</p>
      ) : (
        <div className="w-full" style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={chartMargin({ x: true })}>
              {/* "Sep '26": the range can span years, so every tick says which. */}
              <XAxis
                {...AXIS_BASE}
                dataKey="name"
                {...categoryAxis(chartData.length)}
                padding={{ left: 12, right: 12 }}
                label={axisLabel('Renewal month', 'x')}
              />
              {/* Hidden: every column carries its total. */}
              <YAxis hide />
              <Tooltip
                cursor={{ fill: CURSOR_FILL }}
                // The axis is abbreviated to fit; the tooltip spells the month out.
                labelFormatter={(_, payload) => payload?.[0]?.payload?.full ?? ''}
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: 12 }}
              />

              {HEALTH_STACK.map((status) => (
                <Bar
                  key={status}
                  {...STATIC_SERIES}
                  dataKey={status}
                  stackId="renewal"
                  fill={HEALTH_COLORS[status]}
                  barSize={24}
                  cursor={drillable ? 'pointer' : undefined}
                  onClick={drillable ? (_, index) => openSegment(months[index], status) : undefined}
                >
                  <LabelList {...stackedTotalLabelList(status, chartData)} />
                </Bar>
              ))}
              {/* A month nobody renews in keeps a hairline and "0", so it
                  reads as empty rather than as a gap in the data. */}
              <Bar
                {...STATIC_SERIES}
                {...emptyStackMarker(chartData.map((row) => row.total), '0')}
                stackId="renewal"
                barSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

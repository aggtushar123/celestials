import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import type { HealthStatus } from '../mockData';
import type { RenewalBucket } from '../movement';
import { HEALTH_STACK, emptyStackMarker, stackedTotalLabelList } from '../../../shared/stackedTotalLabel';
import { CURSOR_FILL, HEALTH_COLORS, HEALTH_LEGEND, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';
import { DrillTargets } from '../../../drill/DrillTargets';

export interface RenewalRunwayChartProps {
  buckets: RenewalBucket[];
  /** False when `buckets` were built from a truncated book — a drill from it
   *  would only ever show some of the accounts a segment counted. Defaults
   *  to `true` so every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}

/**
 * What is coming up for renewal, and what state it is in.
 *
 * Buckets by days remaining, which is the "what do I have to act on" cut. The
 * Controls tab's `AccountsByRenewalDateBar` reads the same `renewalDate` field
 * but groups by calendar month, for planning rather than triage.
 */
export function RenewalRunwayChart({ buckets, drillable = true }: RenewalRunwayChartProps) {
  const { open } = useDrill();

  const data = useMemo(
    () =>
      buckets.map((b) => ({
        name: b.label,
        Good: b.counts.Good,
        Average: b.counts.Average,
        Poor: b.counts.Poor,
        total: b.total,
        atRisk: b.atRisk,
      })),
    [buckets],
  );

  const soonest = buckets[0];

  const openSegment = (bucket: RenewalBucket, status: HealthStatus, trigger?: HTMLElement) => {
    const picked = bucket.rows[status];
    open(
      {
        title: `${bucket.label} · ${status}`,
        figure: String(picked.length),
        source: { kind: 'rows', rows: fromHealthRows(picked) },
      },
      trigger,
    );
  };

  // One button per bucket × status that actually has an account in it — a
  // keyboard user (and this chart's own test) can't reach a recharts <Bar>'s
  // SVG segments, so this is the real drill target; the Bar's own onClick
  // below is the pointer shortcut to the same thing. None at all when the
  // book is truncated — see `drillable`.
  const drillItems = drillable
    ? buckets.flatMap((bucket) =>
        HEALTH_STACK.filter((status) => bucket.counts[status] > 0).map((status) => ({
          name: `${bucket.label} · ${status}`,
          figure: String(bucket.counts[status]),
          onSelect: (trigger: HTMLElement) => openSegment(bucket, status, trigger),
        })),
      )
    : [];

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">Renewal runway</h3>
          <p className="text-[11px] text-ink-faint mt-[1px]">
            Accounts by days to renewal, coloured by current health
          </p>
        </div>
        {soonest && soonest.atRisk > 0 && (
          <p className="text-[11px] font-bold text-danger shrink-0">
            {soonest.atRisk} not at Good within {soonest.to} days
          </p>
        )}
      </div>
      <ChartLegend className="px-4 mt-2" items={HEALTH_LEGEND} />

      <DrillTargets label="Renewal runway" items={drillItems} />

      <div className="flex-1 w-full min-h-0 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={chartMargin({ x: true })} barSize={54}>
            <XAxis
              {...AXIS_BASE}
              dataKey="name"
              {...categoryAxis(data.length)}
              label={axisLabel('Days to renewal', 'x')}
            />
            {/* Hidden: every column carries its total, so a count scale
                would only repeat them. */}
            <YAxis hide />
            <Tooltip cursor={{ fill: CURSOR_FILL }} contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }} />
            {HEALTH_STACK.map((status) => (
              <Bar
                {...STATIC_SERIES}
                key={status}
                dataKey={status}
                stackId="renewal"
                fill={HEALTH_COLORS[status]}
                cursor={drillable ? 'pointer' : undefined}
                onClick={drillable ? (_, index) => openSegment(buckets[index], status) : undefined}
              >
                <LabelList {...stackedTotalLabelList(status, data, 11)} />
              </Bar>
            ))}
            {/* A bucket nobody renews in keeps a hairline and "0", so it
                reads as empty rather than as a gap in the data. */}
            <Bar {...STATIC_SERIES} {...emptyStackMarker(data.map((row) => row.total), '0')} stackId="renewal" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

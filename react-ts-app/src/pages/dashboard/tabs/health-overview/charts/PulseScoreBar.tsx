import { useMemo } from 'react';
import { BarChart, Bar, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { HealthDataRow, HealthStatus } from '../mockData';
import { pulseBuckets } from '../controls';
import type { PulseBucket } from '../controls';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { CURSOR_FILL, HEALTH_COLORS, HEALTH_LEGEND, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import { HEALTH_STACK, emptyStackMarker, stackedTotalLabelList } from '../../../shared/stackedTotalLabel';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';
import { DrillTargets } from '../../../drill/DrillTargets';

/**
 * A 1–5 pulse score's spread across the book, each score's column stacked by
 * current health. `CSMPulseBar` and `AIPulseBar` are this chart over the two
 * pulse fields; they differed in nothing but the field and the name.
 */
export function PulseScoreBar({
  data,
  field,
  name,
  drillable = true,
}: {
  data: HealthDataRow[];
  field: 'csmPulseScore' | 'aiPulseScore';
  /** "CSM Pulse" or "AI Pulse": the title, axis and drill labels. */
  name: string;
  /** False when `data` is a truncated book — a drill from it would only ever
   *  show some of the accounts a segment counted. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  const buckets = useMemo(() => pulseBuckets(data, field), [data, field]);
  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        score: String(b.score),
        Poor: b.counts.Poor,
        Average: b.counts.Average,
        Good: b.counts.Good,
        total: b.total,
      })),
    [buckets],
  );

  const openSegment = (bucket: PulseBucket, status: HealthStatus, trigger?: HTMLElement) => {
    const picked = bucket.rows[status];
    open(
      {
        title: `${name} ${bucket.score} · ${status}`,
        figure: String(picked.length),
        source: { kind: 'rows', rows: fromHealthRows(picked) },
      },
      trigger,
    );
  };

  const drillItems = drillable
    ? buckets.flatMap((bucket) =>
        HEALTH_STACK.filter((status) => bucket.rows[status].length > 0).map((status) => ({
          name: `${name} ${bucket.score} · ${status}`,
          figure: String(bucket.rows[status].length),
          onSelect: (trigger: HTMLElement) => openSegment(bucket, status, trigger),
        })),
      )
    : [];

  return (
    <div className="relative w-full p-4 flex flex-col gap-2">
      <h3 className="text-[13px] font-bold text-ink">{name} Score</h3>
      <ChartLegend items={HEALTH_LEGEND} />

      <DrillTargets label={`${name} Score`} items={drillItems} />

      <div className="w-full h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={chartMargin({ x: true })} barSize={24}>
            <XAxis {...AXIS_BASE} dataKey="score" {...categoryAxis(chartData.length)} label={axisLabel(`${name} (1–5)`, 'x')} />
            {/* Hidden: every column carries its total, so a count scale
                would only repeat them. */}
            <YAxis hide />
            <Tooltip cursor={{ fill: CURSOR_FILL }} contentStyle={TOOLTIP_STYLE} />
            {HEALTH_STACK.map((status) => (
              <Bar
                {...STATIC_SERIES}
                key={status}
                dataKey={status}
                stackId="pulse"
                fill={HEALTH_COLORS[status]}
                cursor={drillable ? 'pointer' : undefined}
                onClick={drillable ? (_, index) => openSegment(buckets[index], status) : undefined}
              >
                <LabelList {...stackedTotalLabelList(status, chartData)} />
              </Bar>
            ))}
            {/* A score nobody holds keeps a hairline and "0", so it reads as
                empty rather than as a gap in the data. */}
            <Bar {...STATIC_SERIES} {...emptyStackMarker(chartData.map((row) => row.total), '0')} stackId="pulse" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

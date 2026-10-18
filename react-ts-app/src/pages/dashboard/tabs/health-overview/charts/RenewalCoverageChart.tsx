import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import { formatCompactMoney, formatMoney } from '../../../../../features/customers/formatters';
import type { Coverage, CoverageBand } from '../renewal';
import { COVERAGE_SERIES } from './coverageSeries';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { CURSOR_FILL, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, chartMargin, moneyTick, zeroMoney } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import { emptyStackMarker } from '../../../shared/stackedTotalLabel';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';
import { DrillTargets } from '../../../drill/DrillTargets';

export interface RenewalCoverageChartProps {
  bands: CoverageBand[];
  currency: CurrencyCode;
  /** False when `bands` were built from a truncated book — a drill from it
   *  would only ever show some of the accounts a segment counted. Defaults
   *  to `true` so every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}

/**
 * How much renewing money nobody is talking to.
 *
 * The chart a renewals meeting runs off. Health is deliberately not an axis
 * here — it is the calendar chart's job, and a *Good* account nobody has
 * spoken to in three months is precisely the case a health-only view misses,
 * right up until it doesn't renew.
 *
 * Horizontal bars because the windows are an ordered sequence with long labels,
 * and reading down a list of windows is how the question is asked out loud:
 * "what's in the next thirty days, and who's on it?"
 */
export function RenewalCoverageChart({
  bands,
  currency,
  drillable = true,
}: RenewalCoverageChartProps) {
  const { open } = useDrill();

  // Recharts draws the first row at the bottom, so the nearest window would
  // end up furthest from the title. Reversed here, not in the domain module —
  // window order is a fact about the book, this is a fact about the chart.
  const reversedBands = useMemo(() => [...bands].reverse(), [bands]);
  const data = useMemo(
    () =>
      reversedBands.map((band) => ({
        name: band.label,
        cold: band.cold,
        ageing: band.ageing,
        fresh: band.fresh,
        unknown: band.unknown,
        count: band.count,
        total: band.cold + band.ageing + band.fresh + band.unknown,
      })),
    [reversedBands]
  );

  // The three windows inside 90 days — not 91–180, and **not overdue**: an
  // overdue renewal is not "renewing in 90 days", and counting it here made
  // this headline contradict the tile above it, which reads the same book.
  const NINETY_DAY_WINDOWS = ['30', '60', '90'];
  const exposed = bands
    .filter((band) => NINETY_DAY_WINDOWS.includes(band.key))
    .reduce((sum, band) => sum + band.cold, 0);

  const openSegment = (band: CoverageBand, series: Coverage, trigger?: HTMLElement) => {
    const picked = band.rows[series];
    const seriesLabel = COVERAGE_SERIES.find((s) => s.key === series)?.label ?? series;
    open(
      {
        title: `${band.label} · ${seriesLabel}`,
        // The money the segment draws, not how many accounts are in it —
        // the bars are stacked ARR.
        figure: formatCompactMoney(band[series], currency),
        source: { kind: 'rows', rows: fromHealthRows(picked) },
      },
      trigger
    );
  };

  // One button per window × contact-age series that actually has an account
  // in it — a keyboard user (and this chart's own test) can't reach a
  // recharts <Bar>'s SVG segments, so this is the real drill target; the
  // Bar's own onClick below is the pointer shortcut to the same thing. None
  // at all when the book is truncated — see `drillable`.
  const drillItems = drillable
    ? reversedBands.flatMap((band) =>
        COVERAGE_SERIES.filter((series) => band.rows[series.key].length > 0).map((series) => ({
          name: `${band.label} · ${series.label}`,
          figure: formatCompactMoney(band[series.key], currency),
          onSelect: (trigger: HTMLElement) => openSegment(band, series.key, trigger),
        })),
      )
    : [];

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">Coverage gap</h3>
          <p className="text-[11px] text-ink-faint mt-[1px]">
            ARR by renewal window, split by how long since anyone logged an activity
          </p>
        </div>
        {exposed > 0 && (
          <p className="text-[11px] font-bold text-danger shrink-0">
            {formatCompactMoney(exposed, currency)} renewing in 90 days with no recent contact
          </p>
        )}
      </div>
      <ChartLegend
        className="px-4 mt-2"
        items={COVERAGE_SERIES.map(({ label, color }) => ({ label, color }))}
      />

      <DrillTargets label="Coverage gap" items={drillItems} />

      <div className="flex-1 w-full min-h-0 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={chartMargin({ x: true })}
            barSize={18}
          >
            <XAxis
              {...AXIS_BASE}
              type="number"
              tickFormatter={moneyTick(currency)}
              label={axisLabel(`ARR (${currency})`, 'x')}
            />
            <YAxis
              {...AXIS_BASE}
              type="category"
              dataKey="name"
              width={96}
              tick={{ ...AXIS_BASE.tick, fill: 'var(--text-secondary)', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: CURSOR_FILL }}
              contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
              // See RenewalQuarterChart on why these parameters are untyped.
              formatter={(value, name) => [
                formatMoney(Number(value ?? 0), currency),
                COVERAGE_SERIES.find((series) => series.key === name)?.label ?? String(name),
              ]}
            />
            {COVERAGE_SERIES.map((series) => (
              <Bar
                {...STATIC_SERIES}
                key={series.key}
                dataKey={series.key}
                stackId="arr"
                fill={series.color}
                cursor={drillable ? 'pointer' : undefined}
                onClick={
                  drillable ? (_, index) => openSegment(reversedBands[index], series.key) : undefined
                }
              />
            ))}
            {/* A window with nothing renewing keeps a hairline and "$0", so
                it reads as empty rather than as a gap in the data. */}
            <Bar
              {...STATIC_SERIES}
              {...emptyStackMarker(data.map((row) => row.total), zeroMoney(currency), { horizontal: true })}
              stackId="arr"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

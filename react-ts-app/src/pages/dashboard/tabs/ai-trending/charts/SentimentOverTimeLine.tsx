import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import type { SentimentPoint } from '../../../../../features/interactions/interactionsSlice';
import { SENTIMENT_SERIES, niceMax } from '../chartTheme';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, chartMargin, dateTick } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';

/** How many weeks the line shows. A year of weekly points is 52 ticks on an axis
 *  about 700px wide, which is unreadable; the most recent half-year is what a
 *  trend is read for, and the filter bar's own date range is how you see more. */
const MAX_WEEKS = 26;

const LEGEND = SENTIMENT_SERIES.map((series) => ({ label: series.label, color: series.color, kind: 'line' as const }));

/** Positive / neutral / negative counts per week.
 *
 * The mock pinned its Y axis to `domain={[0, 150]}` with hand-written ticks,
 * which silently clipped anything above 150 — so the axis is derived from the
 * data now. Weeks with no interactions at all are absent from the payload
 * rather than zero-filled, which is deliberate on the backend's part: the gap is
 * the truth, and a zero implies a week that was checked and found empty.
 *
 * Per-point value labels are gone with the mock. At 26 weeks × 3 series they
 * overlapped into illegibility; the tooltip carries the exact numbers. */
export function SentimentOverTimeLine({ data }: { data: SentimentPoint[] }) {
  const rows = data.slice(-MAX_WEEKS);
  const max = niceMax(rows.flatMap((p) => [p.positive, p.neutral, p.negative]));

  return (
    <div className="relative w-full h-full p-6 flex flex-col gap-3">
      <h3 className="text-[14px] font-bold text-ink">Activity Sentiments Over Time</h3>
      <ChartLegend items={LEGEND} />

      <div className="relative w-full h-[320px]">
        {rows.length === 0 ? (
          <p className="text-[12.5px] text-ink-faint">No activity in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={chartMargin({ left: true, x: true })}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
              {/* Flat "15 Jun" weeks, thinned by `minTickGap` rather than
                  rotated: 26 slanted "Jun 15, 2025"s crowded the card. */}
              <XAxis
                {...AXIS_BASE}
                dataKey="date"
                scale="point"
                tickFormatter={dateTick}
                minTickGap={16}
                padding={{ left: 10, right: 10 }}
                label={axisLabel('Week', 'x')}
              />
              <YAxis
                {...AXIS_BASE}
                width={40}
                domain={[0, max]}
                allowDecimals={false}
                label={axisLabel('Interactions')}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />

              {SENTIMENT_SERIES.map((series) => (
                <Line
                  key={series.key}
                  {...STATIC_SERIES}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={{ r: 2, strokeWidth: 1, fill: series.color }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

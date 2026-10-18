import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { TicketSentimentPoint } from '../../../../../features/tickets/ticketsSlice';
import { SENTIMENT_SERIES, niceMax, ticksTo } from '../chartTheme';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, chartMargin, dateTick } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';

const LEGEND = Object.values(SENTIMENT_SERIES).map((series) => ({
  label: series.label,
  color: series.color,
  kind: 'line' as const,
}));

/** What recharts hands a Line's `label` renderer for one point. */
interface PointLabelProps {
  x?: number | string;
  y?: number | string;
  index?: number;
  value?: unknown;
}

/** A value label on the last point only. One on every point collided with its
 *  neighbours, and with the other line, from about a dozen months on; the
 *  tooltip carries every other month's figures. */
function lastPointLabel(count: number, color: string) {
  return function LastPointLabel({ x = 0, y = 0, index, value }: PointLabelProps) {
    if (index !== count - 1) return null;
    return (
      <text x={Number(x)} y={Number(y) - 10} textAnchor="middle" fill={color} fontSize={11} fontWeight={600}>
        {String(value)}
      </text>
    );
  };
}

export function SentimentLineChart({ data }: { data: TicketSentimentPoint[] }) {
  // The mock's domain={[0, 100]} clipped any month past 100 tickets.
  const max = niceMax([...data.map((d) => d.positive), ...data.map((d) => d.negative)]);
  return (
    <div className="relative w-full p-4 flex flex-col gap-2">
      <h3 className="text-[13px] font-bold text-ink">Tickets By Sentiment and Created Date</h3>
      <ChartLegend items={LEGEND} />

      <div className="relative w-full h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={chartMargin({ left: true, x: true })}>
            <XAxis
              {...AXIS_BASE}
              dataKey="date"
              axisLine={{ stroke: 'var(--border-default)' }}
              tickFormatter={dateTick}
              minTickGap={12}
              padding={{ left: 12, right: 12 }}
              label={axisLabel('Created month', 'x')}
            />
            <YAxis
              {...AXIS_BASE}
              width={36}
              domain={[0, max]}
              ticks={ticksTo(max, 5)}
              allowDecimals={false}
              label={axisLabel('Tickets')}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            {/* Negative sentiment is a loss and positive a gain — the one job
                danger and success have. */}
            {(Object.entries(SENTIMENT_SERIES) as [keyof typeof SENTIMENT_SERIES, (typeof SENTIMENT_SERIES)[keyof typeof SENTIMENT_SERIES]][]).map(([key, series]) => (
              <Line
                key={key}
                {...STATIC_SERIES}
                type="linear"
                dataKey={key}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                activeDot={{ r: 6, fill: series.color, strokeWidth: 0 }}
                dot={{ r: 3, fill: series.color, strokeWidth: 0 }}
                label={lastPointLabel(data.length, series.color)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { InteractionBucket } from '../../../../../features/interactions/interactionsSlice';
import { SENTIMENT_COLORS, FALLBACK_COLOR, compact, percentOf } from '../chartTheme';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { DONUT, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { ChartLegend } from '../../../shared/ChartLegend';
import { useDrill } from '../../../drill/useDrill';
import { DrillTargets } from '../../../drill/DrillTargets';

const PATH = '/interactions/stats/';

/** Interactions by sentiment, across all three sources. */
export function ActivitySentimentDonut({
  data,
  query,
  drillable = true,
}: {
  data: InteractionBucket[];
  query: string;
  /** False while the view refetches: the figures on screen are the old
   *  ones, but a drill would send the new query, so nothing opens. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const openSegment = (entry: InteractionBucket, trigger?: HTMLElement) => {
    open(
      {
        title: entry.name,
        figure: String(entry.value),
        source: { kind: 'server', path: PATH, query, segment: `sentiment:${entry.key}` },
      },
      trigger,
    );
  };

  // An empty bucket has no accounts behind it, so it offers no drill.
  const canDrill = (entry: InteractionBucket) => drillable && entry.value > 0;
  const drillItems = data.filter(canDrill).map((entry) => ({
    name: entry.name,
    figure: String(entry.value),
    onSelect: (trigger: HTMLElement) => openSegment(entry, trigger),
  }));

  // The key carries each slice's count and share, so the ring needs no
  // labels of its own: the old ones sat outside a 120px ring and overflowed
  // the card or piled onto each other when slices were thin.
  const legend = data.map((entry) => ({
    label: entry.name,
    color: SENTIMENT_COLORS[entry.name] ?? FALLBACK_COLOR,
    value: `${entry.value.toLocaleString()} · ${percentOf(entry.value, total)}%`,
  }));

  return (
    <div className="w-full h-full p-6 flex flex-col gap-3 relative">
      <h3 className="text-[14px] font-bold text-ink">Activities By Sentiment</h3>
      <ChartLegend items={legend} />
      <DrillTargets label="Activities By Sentiment" items={drillItems} />
      <div className="relative w-full h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              {...STATIC_SERIES}
              data={data}
              cx="50%"
              cy="50%"
              {...DONUT}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={SENTIMENT_COLORS[entry.name] ?? FALLBACK_COLOR}
                  cursor={canDrill(entry) ? 'pointer' : undefined}
                  onClick={canDrill(entry) ? () => openSegment(entry) : undefined}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ fontSize: '13px', fontWeight: 500 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-2xl font-semibold text-ink tracking-tight">{compact(total)}</span>
        </div>
      </div>
    </div>
  );
}

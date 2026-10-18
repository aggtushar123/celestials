import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { TicketBucket } from '../../../../../features/tickets/ticketsSlice';
import { STATUS_COLORS, STATUS_VALUES, FALLBACK_COLOR } from '../chartTheme';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { DONUT, TOOLTIP_STYLE, percentOf } from '../../../shared/chartPalette';
import { ChartLegend } from '../../../shared/ChartLegend';
import { useDrill } from '../../../drill/useDrill';
import { DrillTargets } from '../../../drill/DrillTargets';

const PATH = '/tickets/stats/';

export function StatusDonut({
  data,
  query,
  drillable = true,
}: {
  data: TicketBucket[];
  query: string;
  /** False while the view refetches: the figures on screen are the old
   *  ones, but a drill would send the new query, so nothing opens. */
  drillable?: boolean;
}) {
  const { open } = useDrill();
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  // An empty bucket has no accounts behind it, so it offers no drill.
  const canDrill = (entry: TicketBucket) =>
    drillable && entry.value > 0 && Boolean(STATUS_VALUES[entry.name]);

  const openSegment = (entry: TicketBucket, trigger?: HTMLElement) => {
    const value = STATUS_VALUES[entry.name];
    if (!value || !canDrill(entry)) return;
    open(
      {
        title: entry.name,
        figure: String(entry.value),
        source: { kind: 'server', path: PATH, query, segment: `status:${value}` },
      },
      trigger,
    );
  };

  // One keyboard target per slice the server recognises — same
  // ignore-the-unmapped-name convention the pointer handler follows.
  const drillItems = data
    .filter(canDrill)
    .map((entry) => ({
      name: entry.name,
      figure: String(entry.value),
      onSelect: (trigger: HTMLElement) => openSegment(entry, trigger),
    }));

  // The key carries each slice's count and share, so the ring needs no
  // labels of its own: the old ones sat outside the ring and clipped at the
  // edge of a quarter-width card.
  const legend = data.map((entry) => ({
    label: entry.name,
    color: STATUS_COLORS[entry.name] ?? FALLBACK_COLOR,
    value: `${entry.value} · ${percentOf(entry.value, total)}%`,
  }));

  return (
    <div className="relative w-full p-4 flex flex-col gap-2">
      <h3 className="text-[13px] font-bold text-ink">Ticket Status Distribution</h3>
      <ChartLegend items={legend} />

      <DrillTargets label="Ticket Status Distribution" items={drillItems} />

      <div className="relative w-full h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              {...STATIC_SERIES}
              data={data}
              cx="50%"
              cy="50%"
              {...DONUT}
              startAngle={90}
              endAngle={-270}
              paddingAngle={1}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={STATUS_COLORS[entry.name] ?? FALLBACK_COLOR}
                  cursor={canDrill(entry) ? 'pointer' : undefined}
                  onClick={canDrill(entry) ? () => openSegment(entry) : undefined}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [`${value} ${Number(value) === 1 ? 'ticket' : 'tickets'}`, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-semibold text-ink tabular-nums">{total}</span>
        </div>
      </div>
    </div>
  );
}

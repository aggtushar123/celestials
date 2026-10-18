import { useMemo } from 'react';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { HealthDataRow, HealthStatus } from '../mockData';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { DONUT, HEALTH_COLORS, HEALTH_LEGEND, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { ChartLegend } from '../../../shared/ChartLegend';

interface CurrentHealthDonutProps {
  data: HealthDataRow[];
  activeFilter: HealthStatus | null;
  onSegmentClick: (status: HealthStatus | null) => void;
  filteredCount: number;
}

const SLICE_ORDER: HealthStatus[] = ['Poor', 'Average', 'Good'];

/**
 * The book's current health mix. A slice click filters every chart on the
 * view to that status; clicking it again clears the filter.
 *
 * The key carries each status's count, so the ring needs no labels of its
 * own: the old two-line labels outside the ring clipped at the card edge
 * whenever the card was narrow.
 */
export function CurrentHealthDonut({ data, activeFilter, onSegmentClick }: CurrentHealthDonutProps) {
  const counts = useMemo(() => {
    const byStatus: Record<HealthStatus, number> = { Poor: 0, Average: 0, Good: 0 };
    data.forEach((d) => byStatus[d.healthStatus]++);
    return byStatus;
  }, [data]);

  // Slices run Poor → Good, as they always have; the key reads best first.
  const chartData = SLICE_ORDER.map((name) => ({ name, value: counts[name] }));
  const total = data.length;
  const legend = HEALTH_LEGEND.map((item) => ({ ...item, value: String(counts[item.label as HealthStatus]) }));

  return (
    <div className="w-full p-4 flex flex-col gap-2">
      <h3 className="text-[13px] font-bold text-ink">Current health</h3>
      <ChartLegend items={legend} />

      <div className="relative h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              {...STATIC_SERIES}
              {...DONUT}
              data={chartData}
              cx="50%"
              cy="50%"
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              onClick={(slice) => {
                const status = slice.payload.name as HealthStatus;
                onSegmentClick(status === activeFilter ? null : status);
              }}
            >
              {chartData.map((entry) => {
                const isFaded = activeFilter && activeFilter !== entry.name;
                return (
                  <Cell
                    key={entry.name}
                    fill={HEALTH_COLORS[entry.name]}
                    style={{ opacity: isFaded ? 0.2 : 1, transition: 'opacity 0.3s ease', cursor: 'pointer' }}
                  />
                );
              })}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ fontSize: '13px', fontWeight: 500 }}
              formatter={(value, name) => [`${value}`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-3xl font-medium text-ink tabular-nums">{total}</span>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { HealthStatus } from '../mockData';
import { PULSE_MIDPOINT, QUADRANT_LABEL } from '../divergence';
import type { DivergenceRow } from '../divergence';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { HEALTH_COLORS as STATUS_COLORS, HEALTH_LEGEND, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';

/** Drawn back to front, so the rarer and more urgent states land on top. */
const SERIES_ORDER: HealthStatus[] = ['Good', 'Average', 'Poor'];

const AXIS_MIN = 0.5;
const AXIS_MAX = 5.5;
const TICKS = [1, 2, 3, 4, 5];

interface TooltipPayload {
  payload?: DivergenceRow;
}

function DivergenceTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  const datum = active ? payload?.[0]?.payload : undefined;
  if (!datum) return null;

  const { row, gap, quadrant, daysToRenewal } = datum;
  // `gap` is CSM − AI; the tooltip states it from the AI's side, so a positive
  // gap reads as the AI sitting that far *below* the CSM. Null when unrated.
  const aiOffset = gap === null ? null : -gap;

  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 max-w-[240px]">
      <p className="text-[12px] font-bold text-ink">{row.account}</p>
      <p className="text-[11px] text-ink-faint mb-1">
        {row.owner} · {row.healthStatus}
      </p>
      <p className="text-[11px] text-ink-muted tabular-nums">
        CSM {row.csmPulseScore ?? '—'} · AI {row.aiPulseScore ?? '—'}
        {aiOffset !== null && aiOffset !== 0 && (
          <span className={aiOffset < 0 ? 'text-danger font-bold' : 'text-ink font-bold'}>
            {' '}(AI {aiOffset > 0 ? '+' : '−'}{Math.abs(aiOffset)})
          </span>
        )}
      </p>
      <p className="text-[11px] text-ink-muted">
        {row.activeSeats ?? '—'} active seats
        {daysToRenewal !== null &&
          (daysToRenewal < 0
            ? ` · renewal ${Math.abs(daysToRenewal)}d overdue`
            : ` · renews in ${daysToRenewal}d`)}
      </p>
      <p className="text-[10.5px] text-ink-faint mt-1">
        {quadrant === null ? 'Not rated by both sides' : QUADRANT_LABEL[quadrant]}
      </p>
    </div>
  );
}

export interface PulseDivergenceScatterProps {
  laid: DivergenceRow[];
}

/**
 * Every account plotted by what the CSM thinks against what the model thinks.
 *
 * The diagonal is agreement. Distance from it — in either direction — is the
 * whole point of the chart: `CSMPulseBar` and `AIPulseBar` each show one of
 * these axes on its own, so the gap between them has never had a shape.
 *
 * Colour still encodes current health rather than divergence, so you can see
 * that an account both parties scored highly is nonetheless already Average.
 */
export function PulseDivergenceScatter({ laid }: PulseDivergenceScatterProps) {
  // Unrated accounts have no position on these axes, so they aren't plotted.
  // The view above says how many were left out rather than silently dropping
  // them — a missing dot looks exactly like an account that doesn't exist.
  const plotted = useMemo(() => laid.filter((d) => d.x !== null && d.y !== null), [laid]);

  const bySeries = useMemo(
    () =>
      SERIES_ORDER.map((status) => ({
        status,
        points: plotted.filter((d) => d.row.healthStatus === status),
      })).filter((s) => s.points.length > 0),
    [plotted],
  );

  const seatRange = useMemo(() => {
    const counts = plotted
      .map((d) => d.row.activeSeats)
      .filter((n): n is number => n !== null);
    return counts.length ? ([Math.min(...counts), Math.max(...counts)] as const) : ([0, 1] as const);
  }, [plotted]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">CSM Pulse vs AI Pulse</h3>
          <p className="text-[11px] text-ink-faint mt-[1px]">
            {plotted.length} plotted · dot size = active seats
          </p>
        </div>
        <ChartLegend className="shrink-0" align="end" items={HEALTH_LEGEND} />
      </div>

      {/* min-h-0 lets this flex child actually shrink to its share of the
          card's height instead of being floored by its content. */}
      <div className="flex-1 w-full min-h-0 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={chartMargin({ x: true, left: true })}>
            {/* The two corners where the pulses disagree, washed so the eye
                lands there before it reads a single dot. */}
            <ReferenceArea
              x1={PULSE_MIDPOINT}
              x2={AXIS_MAX}
              y1={AXIS_MIN}
              y2={PULSE_MIDPOINT}
              fill="var(--danger)"
              fillOpacity={0.06}
            />
            {/* Same category as the legend line below it: ink, not the
                (unused, meaningless-here) info blue this used to draw in. */}
            <ReferenceArea
              x1={AXIS_MIN}
              x2={PULSE_MIDPOINT}
              y1={PULSE_MIDPOINT}
              y2={AXIS_MAX}
              fill="var(--text-primary)"
              fillOpacity={0.06}
            />

            <XAxis
              type="number"
              dataKey="x"
              domain={[AXIS_MIN, AXIS_MAX]}
              ticks={TICKS}
              {...AXIS_BASE}
              label={axisLabel('CSM Pulse (1–5)', 'x')}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[AXIS_MIN, AXIS_MAX]}
              ticks={TICKS}
              {...AXIS_BASE}
              width={24}
              label={axisLabel('AI Pulse (1–5)')}
            />
            <ZAxis type="number" dataKey="row.activeSeats" range={[45, 330]} domain={seatRange} />

            {/* Agreement: everything on this line was read the same way twice. */}
            <ReferenceLine
              segment={[
                { x: AXIS_MIN, y: AXIS_MIN },
                { x: AXIS_MAX, y: AXIS_MAX },
              ]}
              stroke="var(--border-strong)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              ifOverflow="hidden"
            />
            <ReferenceLine x={PULSE_MIDPOINT} stroke="var(--border-default)" strokeWidth={1} />
            <ReferenceLine y={PULSE_MIDPOINT} stroke="var(--border-default)" strokeWidth={1} />

            <Tooltip
              content={<DivergenceTooltip />}
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--border-strong)' }}
            />

            {bySeries.map(({ status, points }) => (
              <Scatter
                key={status}
                {...STATIC_SERIES}
                name={status}
                data={points}
                fill={STATUS_COLORS[status]}
                fillOpacity={0.82}
                stroke="var(--bg-surface)"
                strokeWidth={1.5}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[10.5px] text-ink-faint">
        <span>Dashed diagonal = the two pulses agree</span>
        <span className="text-danger font-semibold">Lower-right wash = AI colder than the CSM</span>
        <span className="text-ink font-semibold">Upper-left wash = CSM colder than the AI</span>
      </div>
    </div>
  );
}

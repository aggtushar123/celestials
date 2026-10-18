import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HealthStatus } from '../mockData';
import { STACK_ORDER } from '../movement';
import type { Flow } from '../movement';
import { HEALTH_COLORS as STATUS_COLORS } from '../../../shared/chartPalette';

// Geometry, in real pixels. The chart measures its container and lays out at
// that width with a fixed height, so text is drawn at the size it is set in
// (a scaled viewBox drew the 10px labels at 7px in a narrow card and 17px in
// a wide one). The column pitch comes from the month count, so the chart
// fills the card at any window length.
/** Width used until the container has been measured (and in a test with no
 *  layout at all). */
const FALLBACK_W = 960;
/** Room either side for the first and last columns' counts. */
const PAD = { top: 26, right: 58, bottom: 28, left: 58 };
const COL_W = 13;
const PLOT_H = 250;
/** Blank space between the stacked segments of one column. */
const SEGMENT_GAP = 7;

/** Ribbons for accounts that stayed put recede; the ones that moved carry. */
const HELD_OPACITY = 0.14;
const MOVED_OPACITY = 0.5;

export interface HealthFlowChartProps {
  flow: Flow;
}

interface Segment {
  y: number;
  h: number;
}

/**
 * Accounts flowing between health states, month by month.
 *
 * This is the one chart on the screen that counts *transitions* rather than
 * states. `HealthChangeOverTimeStacked` already shows the totals per month;
 * totals hide churn, because a month where nine accounts fell and nine
 * recovered looks identical to a month where nothing happened.
 *
 * Drawn by hand rather than with recharts: its Sankey is a node-link diagram
 * with no notion of the same category recurring along a time axis, which is
 * exactly what this needs.
 */
/** The element's content width, kept current as the card resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function HealthFlowChart({ flow }: HealthFlowChartProps) {
  const { months, steps } = flow;
  const [frameRef, measured] = useWidth<HTMLDivElement>();
  const viewW = measured > 0 ? measured : FALLBACK_W;

  const layout = useMemo(() => {
    if (months.length === 0) return null;

    // Scale against the busiest month so the tallest column just fills the plot.
    const peak = Math.max(...months.map((m) => m.total), 1);
    const usable = PLOT_H - SEGMENT_GAP * (STACK_ORDER.length - 1);
    const heightOf = (count: number) => (count / peak) * usable;

    // Spread the columns evenly across the measured width.
    const span = Math.max(0, viewW - PAD.left - COL_W - PAD.right);
    const pitch = months.length > 1 ? span / (months.length - 1) : 0;

    const columns = months.map((month, i) => {
      const x = PAD.left + i * pitch;
      const segments = {} as Record<HealthStatus, Segment>;
      let y = PAD.top;
      for (const status of STACK_ORDER) {
        const h = heightOf(month.counts[status]);
        segments[status] = { y, h };
        // Only spend a gap after a segment that actually drew something.
        y += h + (month.counts[status] > 0 ? SEGMENT_GAP : 0);
      }
      return { month, x, segments };
    });

    // Ribbons leave a column in stacking order and arrive in stacking order,
    // so they nest instead of crossing where they don't have to.
    const ribbons = steps.map((step, i) => {
      const left = columns[i];
      const right = columns[i + 1];
      const outCursor = {} as Record<HealthStatus, number>;
      const inCursor = {} as Record<HealthStatus, number>;

      return step.map((t) => {
        const h = heightOf(t.count);
        const y0 = (outCursor[t.from] ??= left.segments[t.from].y);
        const y1 = (inCursor[t.to] ??= right.segments[t.to].y);
        outCursor[t.from] += h;
        inCursor[t.to] += h;

        const x0 = left.x + COL_W;
        const x1 = right.x;
        const mid = (x0 + x1) / 2;
        const d =
          `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} ` +
          `L${x1},${y1 + h} C${mid},${y1 + h} ${mid},${y0 + h} ${x0},${y0 + h} Z`;

        return { t, d, key: `${i}-${t.from}-${t.to}` };
      });
    });

    return { columns, ribbons, peak, width: viewW, height: PAD.top + PLOT_H + PAD.bottom };
  }, [months, steps, viewW]);

  // The frame is always rendered, so it is measured even when the first
  // book it sees has no history yet.
  if (!layout) {
    return (
      <div ref={frameRef} className="w-full">
        <p className="px-4 py-8 text-center text-[12px] text-ink-faint">
          No health history recorded for these accounts.
        </p>
      </div>
    );
  }

  const { columns, ribbons, peak, width, height } = layout;
  const first = columns[0];
  const last = columns[columns.length - 1];

  /** A column's counts beside it: the first column's to its left, the
   *  last's to its right. Only these two are annotated — repeating counts on
   *  every month would bury the ribbons the chart exists to show. */
  const annotate = (column: (typeof columns)[number], side: 'start' | 'end') => {
    const x = side === 'end' ? column.x + COL_W + 7 : column.x - 7;
    const anchor = side === 'end' ? 'start' : 'end';
    return (
      <g data-testid={`flow-${side}`}>
        {STACK_ORDER.map((status) =>
          column.month.counts[status] > 0 ? (
            <g key={status}>
              <text
                x={x}
                y={column.segments[status].y + column.segments[status].h / 2 + 3}
                textAnchor={anchor}
                fontSize={11.5}
                fontWeight={700}
                fill="var(--text-primary)"
              >
                {column.month.counts[status]}
              </text>
              <text
                x={x}
                y={column.segments[status].y + column.segments[status].h / 2 + 15}
                textAnchor={anchor}
                fontSize={10}
                fill="var(--text-tertiary)"
              >
                {status}
              </text>
            </g>
          ) : null,
        )}
      </g>
    );
  };

  return (
    <div ref={frameRef} className="w-full">
      <svg
        width={width}
        height={height}
        className="block"
        role="img"
        aria-label={
          `Health state flow across ${months.length} months, ` +
          `${flow.tracked} accounts. Ribbon width is the number of accounts moving.`
        }
      >
        {/* Ribbons first so the columns read as solid edges on top of them. */}
        {ribbons.flat().map(({ t, d, key }) => (
          <path
            key={key}
            d={d}
            fill={STATUS_COLORS[t.direction === 'held' ? t.from : t.to]}
            fillOpacity={t.direction === 'held' ? HELD_OPACITY : MOVED_OPACITY}
          >
            <title>
              {`${t.count} account${t.count === 1 ? '' : 's'}: ${t.from} → ${t.to}`}
            </title>
          </path>
        ))}

        {columns.map(({ month, x, segments }) =>
          STACK_ORDER.map((status) =>
            month.counts[status] > 0 ? (
              <rect
                key={`${month.label}-${status}`}
                x={x}
                y={segments[status].y}
                width={COL_W}
                height={segments[status].h}
                rx={3}
                fill={STATUS_COLORS[status]}
              >
                <title>{`${month.short}: ${month.counts[status]} ${status}`}</title>
              </rect>
            ) : null,
          ),
        )}

        {/* Month labels along the bottom. */}
        {columns.map(({ month, x }) => (
          <text
            key={`label-${month.label}`}
            x={x + COL_W / 2}
            y={PAD.top + PLOT_H + 18}
            textAnchor="middle"
            fontSize={10}
            fill="var(--text-tertiary)"
          >
            {month.short}
          </text>
        ))}

        {annotate(first, 'start')}
        {columns.length > 1 && annotate(last, 'end')}
      </svg>
      <p className="px-2 text-[11px] text-ink-faint">
        Tallest column = {peak} account{peak === 1 ? '' : 's'}
      </p>
    </div>
  );
}

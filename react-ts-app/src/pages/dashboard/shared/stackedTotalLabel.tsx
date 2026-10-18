import type { HealthStatus } from '../../../features/health/types';
import { ROLE } from './chartPalette';

/** The three health bars, bottom to top, as every stacked chart here orders them. */
export const HEALTH_STACK: HealthStatus[] = ['Poor', 'Average', 'Good'];

export interface StackedDatum {
  Good: number;
  Average: number;
  Poor: number;
  total: number;
}

/** The highest segment that actually has accounts in it, or undefined if empty. */
export function topSegment(datum: StackedDatum): HealthStatus | undefined {
  return topOf(datum as unknown as Record<string, unknown>, HEALTH_STACK) as HealthStatus | undefined;
}

/** The highest key of `stack` (bottom to top) with a value in `datum`. */
function topOf(datum: Record<string, unknown>, stack: readonly string[]): string | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (Number(datum[stack[i]]) > 0) return stack[i];
  }
  return undefined;
}

/** What recharts hands a LabelList `content` renderer for one data point. */
interface LabelContentProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
}

function totalText(x: number, y: number, total: number, fontSize: number, anchor: 'middle' | 'start' = 'middle') {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={fontSize} fontWeight={700} fill="var(--text-secondary)">
      {total}
    </text>
  );
}

/**
 * A total drawn at the end of a stacked bar, on whichever segment is
 * actually last. Spread onto the `LabelList` of each health `<Bar>`:
 * `<LabelList {...stackedTotalLabelList(status, data)} />`.
 *
 * Attaching a `LabelList` to one fixed series (the natural reading of "put
 * the total on the last bar") drops the label on every row where that series
 * is zero. On a health chart that hides the total for exactly the months with
 * no healthy accounts, which are the ones worth reading. So each series gets
 * one, and only the topmost non-empty one draws.
 *
 * Recharts skips a zero-height bar, and the `index` it hands a label counts
 * only the bars it drew, so `data[index]` would point at the wrong row as soon
 * as a series is empty somewhere to its left. The `valueAccessor` hands each
 * label its row's own position in `data` instead.
 *
 * `horizontal` is for a `layout="vertical"` chart: the total sits just past
 * the bar's right end instead of above it. `stack` is the series order,
 * bottom (or left) first, for a stack that is not the three health bands.
 */
export function stackedTotalLabelList<T extends { total: number }>(
  status: string,
  data: T[],
  fontSize = 10,
  { horizontal = false, stack = HEALTH_STACK as readonly string[] } = {},
) {
  return {
    valueAccessor: (entry: { payload?: unknown }) => data.indexOf(entry.payload as T),
    content: function StackedTotalLabel({ x = 0, y = 0, width = 0, height = 0, value }: LabelContentProps) {
      const datum = data[Number(value)];
      if (!datum || datum.total === 0 || topOf(datum as Record<string, unknown>, stack) !== status) return null;
      return horizontal
        ? totalText(Number(x) + Number(width) + 6, Number(y) + Number(height) / 2 + 3, datum.total, fontSize, 'start')
        : totalText(Number(x) + Number(width) / 2, Number(y) - 6, datum.total, fontSize);
    },
  };
}

/** Always zero: the marker series carries no value of its own. */
const noValue = () => 0;

/**
 * Props for one more `<Bar>` at the end of a stack (give it the same
 * `stackId`) that marks the categories whose stack is empty: a hairline on
 * the baseline and `text` ("0", "$0") beside it. Recharts draws neither a
 * bar nor a label for a zero stack, so an empty column reads as missing
 * data rather than as nothing.
 *
 * `totals` is each category's stack total, in `data` order. `horizontal`
 * is for a `layout="vertical"` chart, whose bars run left to right.
 */
export function emptyStackMarker(totals: number[], text: string, { horizontal = false } = {}) {
  return {
    dataKey: noValue,
    name: 'empty',
    fill: ROLE.faint,
    tooltipType: 'none' as const,
    minPointSize: (_value: unknown, index: number) => (totals[index] === 0 ? 2 : 0),
    label: function EmptyStackLabel({ x = 0, y = 0, width = 0, height = 0 }: LabelContentProps) {
      const [lx, ly] = horizontal
        ? [Number(x) + Number(width) + 6, Number(y) + Number(height) / 2 + 3]
        : [Number(x) + Number(width) / 2, Number(y) - 6];
      const anchor = horizontal ? 'start' : 'middle';
      return (
        <text x={lx} y={ly} textAnchor={anchor} fontSize={10} fontWeight={700} fill="var(--text-tertiary)">
          {text}
        </text>
      );
    },
  };
}

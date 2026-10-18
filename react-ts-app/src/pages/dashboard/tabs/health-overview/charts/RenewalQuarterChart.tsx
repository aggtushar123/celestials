import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { HealthStatus } from '../../../../../features/health/types';
import { formatCompactMoney, formatMoney } from '../../../../../features/customers/formatters';
import type { QuarterColumn } from '../renewal';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { CURSOR_FILL, HEALTH_COLORS, HEALTH_LEGEND, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin, moneyTick, zeroMoney } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import { emptyStackMarker } from '../../../shared/stackedTotalLabel';
import { useDrill } from '../../../drill/useDrill';
import { fromHealthRows } from '../../../drill/rows';
import { DrillTargets } from '../../../drill/DrillTargets';

/** Worst at the bottom of the stack, so the at-risk money sits on the axis
 *  where the eye lands rather than floating on top of the healthy revenue. */
const STACK: HealthStatus[] = ['Poor', 'Average', 'Good'];

export interface RenewalQuarterChartProps {
  columns: QuarterColumn[];
  currency: CurrencyCode;
  /** False when `columns` were built from a truncated book — a drill from it
   *  would only ever show some of the accounts a segment counted. Defaults
   *  to `true` so every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}

/**
 * The renewal calendar, in money.
 *
 * One bar per quarter, stacked by the health of the accounts renewing in it —
 * so "a big quarter" and "a big quarter that is mostly shaky" can't look the
 * same, which is exactly what a chart of account counts does to them.
 */
export function RenewalQuarterChart({
  columns,
  currency,
  drillable = true,
}: RenewalQuarterChartProps) {
  const { open } = useDrill();

  const data = useMemo(
    () =>
      columns.map((column) => ({
        name: column.label,
        Good: column.arr.Good,
        Average: column.arr.Average,
        Poor: column.arr.Poor,
        total: column.total,
        count: column.count,
      })),
    [columns]
  );

  const booked = columns.reduce((sum, c) => sum + c.total, 0);
  const atRisk = columns.reduce((sum, c) => sum + c.arr.Poor + c.arr.Average, 0);

  const openSegment = (column: QuarterColumn, status: HealthStatus, trigger?: HTMLElement) => {
    const picked = column.rows[status];
    open(
      {
        title: `${column.label} · ${status}`,
        // The money the segment draws, not how many accounts are in it —
        // the bars are stacked ARR.
        figure: formatCompactMoney(column.arr[status], currency),
        source: { kind: 'rows', rows: fromHealthRows(picked) },
      },
      trigger
    );
  };

  // One button per quarter × status that actually has an account in it — a
  // keyboard user (and this chart's own test) can't reach a recharts <Bar>'s
  // SVG segments, so this is the real drill target; the Bar's own onClick
  // below is the pointer shortcut to the same thing. None at all when the
  // book is truncated — see `drillable`.
  const drillItems = drillable
    ? columns.flatMap((column) =>
        STACK.filter((status) => column.rows[status].length > 0).map((status) => ({
          name: `${column.label} · ${status}`,
          figure: formatCompactMoney(column.arr[status], currency),
          onSelect: (trigger: HTMLElement) => openSegment(column, status, trigger),
        })),
      )
    : [];

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">Renewal calendar</h3>
          <p className="text-[11px] text-ink-faint mt-[1px]">
            ARR up for renewal by quarter, coloured by the account's current health
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-ink-muted">{formatCompactMoney(booked, currency)} ahead</p>
          {atRisk > 0 && (
            <p className="text-[11px] font-bold text-danger">
              {formatCompactMoney(atRisk, currency)} not at Good
            </p>
          )}
        </div>
      </div>
      <ChartLegend className="px-4 mt-2" items={HEALTH_LEGEND} />

      <DrillTargets label="Renewal calendar" items={drillItems} />

      <div className="flex-1 w-full min-h-0 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={chartMargin({ left: true })} barSize={48}>
            <XAxis {...AXIS_BASE} dataKey="name" {...categoryAxis(data.length)} />
            <YAxis
              {...AXIS_BASE}
              width={52}
              tickFormatter={moneyTick(currency)}
              label={axisLabel(`ARR renewing (${currency})`)}
            />
            <Tooltip
              cursor={{ fill: CURSOR_FILL }}
              contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
              // Untyped parameters: Recharts hands these through as
              // `ValueType | undefined`, and the stack only ever carries
              // numbers, so the coercion is at the boundary rather than an
              // `any` on the signature.
              formatter={(value, name) => [formatMoney(Number(value ?? 0), currency), String(name)]}
            />
            {STACK.map((status) => (
              <Bar
                {...STATIC_SERIES}
                key={status}
                dataKey={status}
                stackId="arr"
                fill={HEALTH_COLORS[status]}
                cursor={drillable ? 'pointer' : undefined}
                onClick={drillable ? (_, index) => openSegment(columns[index], status) : undefined}
              />
            ))}
            {/* A quarter nothing renews in keeps a hairline and "$0", so it
                reads as empty rather than as a gap in the data. */}
            <Bar
              {...STATIC_SERIES}
              {...emptyStackMarker(data.map((row) => row.total), zeroMoney(currency))}
              stackId="arr"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

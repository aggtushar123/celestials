import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { ProductRow } from '../../../../../features/products/productsSlice';
import {
  formatCompactMoney,
  formatMoney,
} from '../../../../../features/customers/formatters';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { ROLE, TOOLTIP_STYLE, CURSOR_FILL } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import type { LegendItem } from '../../../shared/ChartLegend';

/** The three segments, in the order they stack. Also the chart's own key. */
const LABELS: Record<string, string> = {
  healthy: 'In good health',
  unhealthy: 'Not in good health',
  lost: 'Already churned',
};

const KEY: LegendItem[] = [
  { label: LABELS.healthy, color: ROLE.gain },
  { label: LABELS.unhealthy, color: ROLE.loss },
  { label: LABELS.lost, color: ROLE.faint },
];


export interface ProductMoneyChartProps {
  rows: ProductRow[];
  currency: CurrencyCode;
}

/**
 * The screen's thesis in one chart: per product, money held in healthy
 * accounts, money held in accounts that are not, and money already gone.
 *
 * Three segments because a single ARR bar per product answers the easy
 * question — which product is biggest — and hides the one worth asking. A
 * product can be the largest on the book and still be the one leaking: that
 * shows up here as a tall bar made mostly of the two darker segments.
 *
 * The churned segment is stacked on *beside* the live ones rather than
 * included in them: it is not revenue, it is revenue that left. Showing it in
 * the same bar is the point — a product's past is the best available evidence
 * about its present.
 */
export function ProductMoneyChart({ rows, currency }: ProductMoneyChartProps) {
  const data = useMemo(
    () =>
      rows.map((row) => ({
        name: row.product,
        healthy: Math.max(0, row.arr - row.unhealthy_arr),
        unhealthy: row.unhealthy_arr,
        lost: row.churned_arr,
        customers: row.customers,
      })),
    [rows]
  );

  const anyMoney = data.some((row) => row.healthy + row.unhealthy + row.lost > 0);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">ARR by product</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          What each product leads, split by the health of the accounts holding it — with the ARR
          that has already left alongside
        </p>
        {/* Our own key rather than Recharts' Legend, which orders itself by
            series and read back healthy / churned / unhealthy. The order here
            is the order of the stack, bottom segment first. Under the title,
            so it wraps rather than squeezing the subtitle. */}
        <ChartLegend className="mt-2" items={KEY} />
      </div>

      <div className="flex-1 w-full min-h-0 px-2 pb-1">
        {!anyMoney ? (
          <p className="px-2 py-6 text-[12px] text-ink-faint">
            No priced customers in this selection.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* Capped bar width: filtering to one product is a first-class
                action on this screen, and an uncapped bar fills the whole
                card when there is only one category. */}
            <BarChart
              data={data}
              margin={chartMargin({ left: true })}
              maxBarSize={84}
            >
              <XAxis {...AXIS_BASE} dataKey="name" {...categoryAxis(data.length)} />
              <YAxis
                {...AXIS_BASE}
                width={56}
                tickFormatter={(value: number) => formatCompactMoney(value, currency)}
                label={axisLabel(`ARR (${currency})`)}
              />
              <Tooltip
                cursor={{ fill: CURSOR_FILL }}
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value, name) => [
                  formatMoney(Number(value ?? 0), currency),
                  LABELS[String(name)] ?? String(name),
                ]}
              />
              {/* No grow-in animation, same as OriginBar: a stacked bar
                  climbing from zero reads as if the healthy/unhealthy split
                  were changing, and this screen is re-fetched on every filter
                  change — the comparison should be legible immediately. */}
              <Bar
                {...STATIC_SERIES}
                dataKey="healthy"
                stackId="live"
                fill={ROLE.gain}
              />
              <Bar
                {...STATIC_SERIES}
                dataKey="unhealthy"
                stackId="live"
                fill={ROLE.loss}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                {...STATIC_SERIES}
                dataKey="lost"
                fill={ROLE.faint}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

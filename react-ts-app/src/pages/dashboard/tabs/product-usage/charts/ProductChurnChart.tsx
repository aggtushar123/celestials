import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { ProductRow } from '../../../../../features/products/productsSlice';
import {
  formatCompactMoney,
  formatMoney,
} from '../../../../../features/customers/formatters';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { ROLE, TOOLTIP_STYLE, CURSOR_FILL } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin, pctTick } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';


export interface ProductChurnChartProps {
  rows: ProductRow[];
  currency: CurrencyCode;
}

/**
 * Churn by product: the bar is the ARR that left, the line is the share of
 * everyone the product ever led.
 *
 * Both, because either alone misleads. A product with one $150K departure and
 * a product with ten $15K departures lost the same money and are not the same
 * problem, and a 50% churn rate on two customers is a coin toss rather than a
 * verdict. Ranked by money, with the rate riding on top so a small product
 * bleeding out is still visible.
 *
 * Products that have never lost anyone are left out — they are the good news,
 * and a row of zeroes would squash the bars that matter.
 */
export function ProductChurnChart({ rows, currency }: ProductChurnChartProps) {
  const data = useMemo(
    () =>
      rows
        .filter((row) => row.churned > 0)
        .map((row) => ({
          name: row.product,
          lost: row.churned_arr,
          rate: row.churn_rate,
          customers: row.churned,
        }))
        .sort((a, b) => b.lost - a.lost),
    [rows]
  );

  // Products that have had customers and kept them. A product nobody has ever
  // been on is not a retention record, so it is counted in neither number.
  const clean = rows.filter((row) => row.churned === 0 && row.customers > 0).length;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Churn by product</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          ARR that left, with the share of everyone the product ever led · ranked by money
        </p>
        <ChartLegend
          className="mt-2"
          items={[
            { label: 'ARR lost', color: ROLE.loss },
            { label: 'Churn rate', color: ROLE.ink, kind: 'line' },
          ]}
        />
      </div>

      <div className="flex-1 w-full min-h-0 px-2 pb-1">
        {data.length === 0 ? (
          <p className="px-2 py-6 text-[12px] text-ink-faint">
            No customers in this selection have churned.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* Capped for the same reason as the ARR chart: one product
                selected should not mean one card-wide bar. */}
            <ComposedChart
              data={data}
              margin={chartMargin({ left: true, right: true })}
              maxBarSize={84}
            >
              <XAxis {...AXIS_BASE} dataKey="name" {...categoryAxis(data.length)} />
              <YAxis
                {...AXIS_BASE}
                yAxisId="money"
                width={56}
                tickFormatter={(value: number) => formatCompactMoney(value, currency)}
                label={axisLabel(`ARR lost (${currency})`)}
              />
              <YAxis
                {...AXIS_BASE}
                yAxisId="rate"
                orientation="right"
                width={38}
                domain={[0, 100]}
                tickFormatter={pctTick}
                label={axisLabel('Churn rate %', 'right')}
              />
              <Tooltip
                cursor={{ fill: CURSOR_FILL }}
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value, name, item) =>
                  name === 'rate'
                    ? [`${value}% of everyone it ever led`, item?.payload?.name ?? '']
                    : [
                        `${formatMoney(Number(value ?? 0), currency)} · ${
                          item?.payload?.customers ?? 0
                        } left`,
                        item?.payload?.name ?? '',
                      ]
                }
              />
              <Bar
                {...STATIC_SERIES}
                yAxisId="money"
                dataKey="lost"
                fill={ROLE.loss}
                radius={[3, 3, 0, 0]}
              />
              <Line
                {...STATIC_SERIES}
                yAxisId="rate"
                type="monotone"
                dataKey="rate"
                stroke={ROLE.ink}
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {clean > 0 && (
        <p className="px-4 pb-3 text-[10.5px] text-ink-faint">
          {clean} product{clean === 1 ? '' : 's'} here {clean === 1 ? 'has' : 'have'} never lost a
          customer and {clean === 1 ? 'is' : 'are'} not charted.
        </p>
      )}
    </div>
  );
}

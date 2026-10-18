import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CohortRow } from '../../../../../features/portfolio/portfolioSlice';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { ROLE, TOOLTIP_STYLE, CURSOR_FILL } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';

export interface CohortChartProps {
  rows: CohortRow[];
  undated: number;
}

/**
 * How each year's intake has held up.
 *
 * Stacked so a cohort's size and its survival read at once: a year that signed
 * twelve and kept nine is a different story from one that signed three and kept
 * three, and a retention percentage alone makes them identical.
 *
 * Grouped by calendar year rather than quarter — on a book this size quarterly
 * cohorts are cohorts of one, and a retention rate of 0% or 100% with nothing
 * in between.
 */
export function CohortChart({ rows, undated }: CohortChartProps) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Cohort survival</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          Customers by the year they joined, and how many are still here
        </p>
        <ChartLegend
          className="mt-2"
          items={[
            { label: 'Retained', color: ROLE.gain },
            { label: 'Churned', color: ROLE.loss },
          ]}
        />
      </div>

      <div className="flex-1 w-full min-h-0 px-2 pb-1">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-[12px] text-ink-faint">
            No customers in this selection have a join date recorded.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={chartMargin({ left: true, x: true })} barSize={42}>
              <XAxis
                {...AXIS_BASE}
                dataKey="year"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                label={axisLabel('Year joined', 'x')}
              />
              <YAxis
                {...AXIS_BASE}
                width={36}
                allowDecimals={false}
                label={axisLabel('Customers')}
              />
              <Tooltip
                cursor={{ fill: CURSOR_FILL }}
                contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
                formatter={(value, _name, item) =>
                  item?.dataKey === 'retained'
                    ? [`${value} still here (${item?.payload?.retention ?? 0}%)`, 'Retained']
                    : [`${value} left`, 'Churned']
                }
              />
              <Bar {...STATIC_SERIES} dataKey="retained" name="Retained" stackId="cohort" fill={ROLE.gain} />
              <Bar
                {...STATIC_SERIES}
                dataKey="churned"
                name="Churned"
                stackId="cohort"
                fill={ROLE.loss}
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {undated > 0 && (
        <p className="px-4 pb-3 text-[10.5px] text-ink-faint">
          {/* Counted apart rather than folded into the earliest year, which
              would make the oldest cohort look bigger and its survival worse. */}
          {undated} customer{undated === 1 ? '' : 's'} with no join date recorded, counted in no
          cohort.
        </p>
      )}
    </div>
  );
}

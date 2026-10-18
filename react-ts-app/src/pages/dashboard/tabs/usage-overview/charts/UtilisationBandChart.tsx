import { useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { UsageAccount, UsageBand } from '../../../../../features/usage/usageSlice';
import { formatCompactMoney, formatMoney } from '../../../../../features/customers/formatters';
import { BAND_COLORS, BAND_SHORT, FALLBACK_COLOR, niceMax } from '../chartTheme';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { CURSOR_FILL, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin, moneyTick, zeroMoney } from '../../../shared/chartAxis';
import { emptyStackMarker } from '../../../shared/stackedTotalLabel';
import { useDrill } from '../../../drill/useDrill';
import { fromUsageRows } from '../../../drill/rows';
import { DrillTargets } from '../../../drill/DrillTargets';

/** "Low\n25–50%": the short name over the range the API's own name carries
 *  in brackets, so the axis says what the bands mean. */
function tickName(band: UsageBand): string {
  const short = BAND_SHORT[band.key] ?? band.name;
  const range = /\(([^)]+)\)/.exec(band.name)?.[1];
  return range && short !== band.name ? `${short}\n${range}` : short;
}

export interface UtilisationBandChartProps {
  bands: UsageBand[];
  /** Every measured account — filtered by `band` to answer "who is in this
   *  bar" when one is clicked. */
  scatter: UsageAccount[];
  currency: CurrencyCode;
  /** Accounts with no seat data — named under the chart rather than left out
   *  of it silently. */
  unmeasured: number;
  /** False when `scatter` is a truncated slice of the full measured book —
   *  a drill from it would only ever show some of the accounts behind a bar.
   *  Defaults to `true` so every existing caller (and test) keeps drilling. */
  drillable?: boolean;
}

/**
 * The shape of the book: how much ARR sits in each utilisation band.
 *
 * Bars are money, not account counts. Three dormant ten-seat pilots and one
 * dormant enterprise rollout are the same bar on a count chart and nothing
 * like the same problem, and this screen exists to tell them apart.
 */
export function UtilisationBandChart({
  bands,
  scatter,
  currency,
  unmeasured,
  drillable = true,
}: UtilisationBandChartProps) {
  const { open } = useDrill();

  const data = useMemo(
    () =>
      bands.map((band) => ({
        key: band.key,
        name: tickName(band),
        full: band.name,
        arr: band.arr,
        accounts: band.accounts,
        idle: band.idle_seats,
      })),
    [bands]
  );

  const max = niceMax(data.map((row) => row.arr));

  const openBand = (row: (typeof data)[number], trigger?: HTMLElement) => {
    open(
      {
        title: row.full,
        figure: formatCompactMoney(row.arr, currency),
        source: {
          kind: 'rows',
          rows: fromUsageRows(
            scatter.filter((account) => account.band === row.key),
            (account) => `${account.utilisation ?? 0}% used`,
          ),
        },
      },
      trigger,
    );
  };

  // One button per non-empty band — a keyboard user can't reach a recharts
  // <Bar>'s SVG cells (neither can this chart's own test), so this is the
  // real drill target; the Cell's own onClick below is the pointer shortcut
  // to the same thing. None at all when the book is truncated — see
  // `drillable`.
  const drillItems = drillable
    ? data
        .filter((row) => row.accounts > 0)
        .map((row) => ({
          name: row.full,
          figure: formatCompactMoney(row.arr, currency),
          onSelect: (trigger: HTMLElement) => openBand(row, trigger),
        }))
    : [];

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Where the money sits</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          ARR by how much of the contracted seats each account actually uses
        </p>
      </div>

      <div className="px-4">
        <DrillTargets label="Where the money sits" items={drillItems} />
      </div>

      <div className="flex-1 w-full min-h-0 px-2 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={chartMargin({ x: true, left: true })} barSize={44}>
            <XAxis
              {...AXIS_BASE}
              dataKey="name"
              {...categoryAxis(data.length)}
              label={axisLabel('Seat utilisation', 'x')}
            />
            <YAxis
              {...AXIS_BASE}
              width={52}
              domain={[0, max]}
              tickFormatter={moneyTick(currency)}
              label={axisLabel(`ARR (${currency})`)}
            />
            <Tooltip
              cursor={{ fill: CURSOR_FILL }}
              contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
              formatter={(value, _name, item) => [
                `${formatMoney(Number(value ?? 0), currency)} · ${item?.payload?.accounts ?? 0} accounts · ${item?.payload?.idle ?? 0} idle seats`,
                item?.payload?.full ?? '',
              ]}
            />
            <Bar
              {...STATIC_SERIES}
              dataKey="arr"
              stackId="band"
              radius={[4, 4, 0, 0]}
              cursor={drillable ? 'pointer' : undefined}
            >
              {data.map((row) => (
                <Cell
                  key={row.key}
                  fill={BAND_COLORS[row.key] ?? FALLBACK_COLOR}
                  onClick={drillable ? () => openBand(row) : undefined}
                />
              ))}
            </Bar>
            {/* A band holding no ARR keeps a hairline and "$0", so it reads
                as empty rather than as a gap in the data. */}
            <Bar {...STATIC_SERIES} {...emptyStackMarker(data.map((row) => row.arr), zeroMoney(currency))} stackId="band" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {unmeasured > 0 && (
        <p className="px-4 pb-3 text-[11px] text-ink-faint">
          {unmeasured} {unmeasured === 1 ? 'account has' : 'accounts have'} no seat data and{' '}
          {unmeasured === 1 ? 'is' : 'are'} not counted here — no seats recorded is not the same as
          none used.
        </p>
      )}
    </div>
  );
}

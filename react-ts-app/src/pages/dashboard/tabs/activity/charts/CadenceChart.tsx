import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { CadenceBucket } from '../../../../../features/activity/activitySlice';
import { formatCompactMoney, formatMoney } from '../../../../../features/customers/formatters';
import { STATIC_SERIES } from '../../../../../components/shared/chartAnimation';
import { CURSOR_FILL, ROLE, TOOLTIP_STYLE } from '../../../shared/chartPalette';
import { AXIS_BASE, axisLabel, categoryAxis, chartMargin } from '../../../shared/chartAxis';
import { ChartLegend } from '../../../shared/ChartLegend';
import { emptyStackMarker } from '../../../shared/stackedTotalLabel';

/** Fresher is better, so this one *is* a scale — and "never" is grey rather
 *  than the darkest red, because it is a different kind of fact: an absence of
 *  records, not a long silence. */
const BUCKET_COLORS: Record<string, string> = {
  week: ROLE.gain,
  month: ROLE.gain,
  stale: ROLE.caution,
  dark: ROLE.loss,
  cold: ROLE.loss,
  never: ROLE.faint,
};

/** What the four colours mean. */
const LEGEND = [
  { label: 'On track', color: ROLE.gain },
  { label: 'Stale', color: ROLE.caution },
  { label: 'Dark', color: ROLE.loss },
  { label: 'Never', color: ROLE.faint },
];

/** Axis labels. The API's own names carry their units ("No contact logged"),
 *  which is right in a tooltip and collides with its neighbour under a bar —
 *  six categories in a third-width card leaves about six characters each. */
const SHORT_LABELS: Record<string, string> = {
  week: '≤7d',
  month: '8–30d',
  stale: '31–60d',
  dark: '61–90d',
  cold: '90d+',
  never: 'Never',
};

export interface CadenceChartProps {
  buckets: CadenceBucket[];
  currency: CurrencyCode;
  threshold: number;
}

/**
 * How long it has been since anyone contacted each account.
 *
 * The shape of the book's cadence: a coverage percentage says how many were
 * touched, this says how recently, which is the difference between a team on a
 * rhythm and a team that did everything in one panicked week.
 *
 * Bars are account counts with ARR in the tooltip. Counts lead here — unlike
 * the money-first charts elsewhere — because cadence is a discipline question,
 * and a small account nobody has called is still nobody calling.
 */
export function CadenceChart({ buckets, currency, threshold }: CadenceChartProps) {
  const behind = buckets
    .filter((bucket) => ['dark', 'cold', 'never'].includes(bucket.key))
    .reduce((sum, bucket) => sum + bucket.accounts, 0);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">Contact cadence</h3>
          <p className="text-[11px] text-ink-faint mt-[1px]">
            Accounts by time since any logged contact
          </p>
        </div>
        {behind > 0 && (
          <p className="text-[11px] font-bold text-danger shrink-0">
            {behind} past {threshold} days
          </p>
        )}
      </div>
      <ChartLegend className="px-4 mt-2" items={LEGEND} />

      <div className="flex-1 w-full min-h-0 px-2 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={buckets.map((bucket) => ({
              ...bucket,
              short: SHORT_LABELS[bucket.key] ?? bucket.name,
            }))}
            margin={chartMargin({ x: true, left: true })}
            barSize={40}
          >
            <XAxis
              {...AXIS_BASE}
              dataKey="short"
              {...categoryAxis(buckets.length)}
              label={axisLabel('Days since last contact', 'x')}
            />
            <YAxis {...AXIS_BASE} width={32} allowDecimals={false} label={axisLabel('Accounts')} />
            <Tooltip
              cursor={{ fill: CURSOR_FILL }}
              contentStyle={{ ...TOOLTIP_STYLE, fontSize: '12px' }}
              formatter={(value, _name, item) => [
                `${value} account${value === 1 ? '' : 's'} · ${formatMoney(
                  Number(item?.payload?.arr ?? 0),
                  currency
                )}`,
                item?.payload?.name ?? '',
              ]}
            />
            <Bar {...STATIC_SERIES} dataKey="accounts" stackId="cadence" radius={[3, 3, 0, 0]}>
              {buckets.map((bucket) => (
                <Cell key={bucket.key} fill={BUCKET_COLORS[bucket.key] ?? ROLE.faint} />
              ))}
            </Bar>
            {/* A bucket nobody sits in keeps a hairline and "0", so it reads
                as empty rather than as a gap in the data. */}
            <Bar
              {...STATIC_SERIES}
              {...emptyStackMarker(buckets.map((bucket) => bucket.accounts), '0')}
              stackId="cadence"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="px-4 pb-3 text-[10.5px] text-ink-faint">
        Counts any logged contact — call, email, note, meeting or activity — on the company or
        any of its accounts. The same rule the health score's Customer Touch component reads.
        {buckets.find((b) => b.key === 'never')?.accounts
          ? ` ${formatCompactMoney(
              buckets.find((b) => b.key === 'never')?.arr ?? 0,
              currency
            )} has no contact on record at all.`
          : ''}
      </p>
    </div>
  );
}

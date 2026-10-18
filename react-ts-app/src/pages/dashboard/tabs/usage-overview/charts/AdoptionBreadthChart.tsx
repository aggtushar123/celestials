import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { AdoptionBucket } from '../../../../../features/usage/usageSlice';
import { formatCompactMoney } from '../../../../../features/customers/formatters';
import { zeroMoney } from '../../../shared/chartAxis';

export interface AdoptionBreadthChartProps {
  buckets: AdoptionBucket[];
  currency: CurrencyCode;
}

/**
 * How many products each account has taken, by ARR.
 *
 * The cross-sell view, and the other half of "are they using what they pay
 * for": an account on one product has more room to grow and less reason to
 * stay. Seat utilisation says how deep the relationship is; this says how wide.
 *
 * Hand-drawn bars rather than Recharts — four rows, one number each against one
 * scale, with a label either side. A charting library would add an axis, a
 * tooltip and a container height to draw a percentage.
 */
export function AdoptionBreadthChart({ buckets, currency }: AdoptionBreadthChartProps) {
  const widest = Math.max(1, ...buckets.map((bucket) => bucket.arr));
  const total = buckets.reduce((sum, bucket) => sum + bucket.accounts, 0);

  return (
    <div className="w-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Adoption breadth</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          ARR by how many products the account has taken
        </p>
      </div>

      {total === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">No accounts in this selection.</p>
      ) : (
        // A handful of buckets at most: the list is bounded, so it never scrolls.
        <ul className="px-4 py-3 flex flex-col gap-[10px]">
          {buckets.map((bucket) => (
            <li key={bucket.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium text-ink truncate">{bucket.name}</span>
                <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                  {bucket.arr === 0 ? zeroMoney(currency) : formatCompactMoney(bucket.arr, currency)} ·{' '}
                  {bucket.accounts}{' '}
                  {bucket.accounts === 1 ? 'account' : 'accounts'}
                </span>
              </div>
              <div className="mt-[3px] h-[10px] rounded-[3px] bg-subtle overflow-hidden">
                <div
                  data-testid="adoption-bar"
                  className="h-full rounded-[3px] bg-ink"
                  style={{ width: `${(bucket.arr / widest) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

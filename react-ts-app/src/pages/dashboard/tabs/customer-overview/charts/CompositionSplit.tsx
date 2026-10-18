import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { CompositionRow } from '../../../../../features/portfolio/portfolioSlice';
import { formatCompactMoney } from '../../../../../features/customers/formatters';

export interface CompositionSplitProps {
  title: string;
  subtitle: string;
  rows: CompositionRow[];
  currency: CurrencyCode;
  /** Size bands that couldn't be placed — an unpriced account is of unknown
   *  size, not a small one. */
  unplaced?: number;
  emptyMessage: string;
}

/**
 * A composition cut: accounts and ARR per bucket, on one bar each.
 *
 * **Both numbers, always.** On most books the smallest band holds the most
 * customers and the least money, and a screen showing one of those without the
 * other argues for the wrong thing — count alone says "focus on the long tail",
 * money alone says "the tail doesn't exist". The bar is ARR, the count rides
 * beside it.
 *
 * Two instances on this screen: by size band and by lifecycle stage. One
 * component, because the only difference is which bucket list is passed in.
 */
export function CompositionSplit({
  title,
  subtitle,
  rows,
  currency,
  unplaced = 0,
  emptyMessage,
}: CompositionSplitProps) {
  const widest = Math.max(1, ...rows.map((row) => row.arr));
  const anyCustomers = rows.some((row) => row.customers > 0);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">{subtitle}</p>
      </div>

      {!anyCustomers ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">{emptyMessage}</p>
      ) : (
        // No scroller: the buckets are a small fixed set (size bands,
        // lifecycle stages), so the card grows to hold them all.
        <ul className="px-4 py-3 flex flex-col gap-[10px]">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-medium text-ink truncate">{row.name}</span>
                <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                  {formatCompactMoney(row.arr, currency)} · {row.customers}{' '}
                  {row.customers === 1 ? 'customer' : 'customers'}
                </span>
              </div>
              <div className="mt-[3px] h-[10px] rounded-[3px] bg-subtle overflow-hidden">
                <div
                  className="h-full rounded-[3px] bg-ink-faint"
                  style={{ width: `${(row.arr / widest) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {unplaced > 0 && (
        <p className="px-4 pb-3 text-[10.5px] text-ink-faint">
          {unplaced} customer{unplaced === 1 ? '' : 's'} unplaced — no exchange rate for their
          contract currency, which is unknown size rather than small.
        </p>
      )}
    </div>
  );
}

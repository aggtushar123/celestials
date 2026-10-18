import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { ChurnReason } from '../../../../../features/portfolio/portfolioSlice';
import { formatCompactMoney } from '../../../../../features/customers/formatters';

export interface ChurnReasonListProps {
  reasons: ChurnReason[];
  currency: CurrencyCode;
}

/**
 * Why the customers who left, left — ranked by the ARR that went with them.
 *
 * Ranked by money rather than by count, because two small accounts leaving
 * over price and one large one leaving over a missing feature are not the same
 * problem, and a count chart says they are.
 *
 * The reasons are a closed list since backend migration 0028, which changes what
 * this chart can show. It used to carry a footnote apologising for free text —
 * "Budget cuts" and "Budget Cut" were two rows and folding could not merge
 * them. Now the payload includes **every** reason on the list, including the
 * ones nobody left for, and those are summarised in one line rather than
 * given nine equal-weight rows of zero: an empty reason is worth knowing and
 * is not worth a bar.
 */
export function ChurnReasonList({ reasons, currency }: ChurnReasonListProps) {
  const happened = reasons.filter((reason) => reason.customers > 0);
  const never = reasons.filter((reason) => reason.customers === 0);
  const widest = Math.max(1, ...happened.map((reason) => reason.arr));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Why they left</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          Churn reasons by the ARR that left with them
        </p>
      </div>

      {happened.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">
          No customers in this selection have churned.
        </p>
      ) : (
        <>
          <ul className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-[10px]">
            {happened.map((reason) => (
              <li key={reason.value}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-medium text-ink truncate">
                    {reason.reason}
                  </span>
                  <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                    {formatCompactMoney(reason.arr, currency)} · {reason.customers}
                  </span>
                </div>
                <div className="mt-[3px] h-[10px] rounded-[3px] bg-subtle overflow-hidden">
                  <div
                    className="h-full rounded-[3px] bg-danger/70"
                    style={{ width: `${(reason.arr / widest) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {never.length > 0 && (
            <p className="px-4 pb-3 text-[10.5px] text-ink-faint">
              {/* The labels as the API writes them — lowercasing them read
                  badly the moment one of them was "Other". */}
              Nothing lost to: {never.map((reason) => reason.reason).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

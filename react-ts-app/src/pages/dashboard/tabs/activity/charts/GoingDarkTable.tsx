import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { DarkAccount } from '../../../../../features/activity/activitySlice';
import { formatMoney } from '../../../../../features/customers/formatters';
import { ScrollTable } from '../../../shared/ScrollTable';

const HEALTH_STYLE: Record<DarkAccount['health_category'], string> = {
  good: 'bg-success-dim text-success',
  average: 'bg-warning-dim text-warning',
  poor: 'bg-danger-dim text-danger',
};

const HEALTH_LABEL: Record<DarkAccount['health_category'], string> = {
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
};

export interface GoingDarkTableProps {
  rows: DarkAccount[];
  currency: CurrencyCode;
  threshold: number;
}

/**
 * The accounts nobody has spoken to, longest silence first.
 *
 * The work list this screen produces. A *Good* account nobody has contacted in
 * three months is the case every other dashboard misses — health is a lagging
 * measure, and this is the leading one.
 *
 * "Never" sorts above merely-stale and shows as such rather than as a large
 * number: an account with no contact on record is a different fact from one
 * last called in March.
 */
export function GoingDarkTable({ rows, currency, threshold }: GoingDarkTableProps) {
  return (
    <div className="w-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Going quiet</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          No logged contact in {threshold}+ days, longest silence first
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">
          Every account in this selection has been contacted inside {threshold} days.
        </p>
      ) : (
        // Scrolls inside its card with the header pinned, instead of growing
        // the page by every quiet account.
        <ScrollTable caption="Going quiet" maxHeight={420} className="mx-2 mb-3 mt-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                {['Account', 'Silent for', 'ARR', 'Owner'].map((heading) => (
                  <th
                    key={heading}
                    className="px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-line-subtle hover:bg-subtle/60 transition-colors"
                >
                  <td className="px-2 py-[7px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-[1px] rounded text-[10px] font-bold shrink-0 ${HEALTH_STYLE[row.health_category]}`}
                      >
                        {HEALTH_LABEL[row.health_category]}
                      </span>
                      <span className="text-[12.5px] font-medium text-ink">{row.name}</span>
                    </div>
                    <p className="text-[10.5px] text-ink-faint mt-[1px]">{row.lifecycle_stage}</p>
                  </td>
                  <td className="px-2 py-[7px] text-[12px] font-semibold text-danger tabular-nums whitespace-nowrap">
                    {row.days_since_contact === null
                      ? 'never contacted'
                      : `${row.days_since_contact}d`}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink tabular-nums whitespace-nowrap">
                    {row.arr === null ? '—' : formatMoney(row.arr, currency)}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink-muted whitespace-nowrap">
                    {row.owner}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
    </div>
  );
}

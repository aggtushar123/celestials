import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { UsageAccount } from '../../../../../features/usage/usageSlice';
import { formatMoney } from '../../../../../features/customers/formatters';
import { BAND_COLORS, BAND_SHORT, FALLBACK_COLOR } from '../chartTheme';
import { ScrollTable } from '../../../shared/ScrollTable';

export interface AccountUsageListProps {
  title: string;
  subtitle: string;
  rows: UsageAccount[];
  currency: CurrencyCode;
  /** Which money column to lead with. Shelfware ranks by what's wasted;
   *  capacity ranks by what the account already pays, because that is what the
   *  expansion scales from. */
  moneyColumn: 'shelfware' | 'arr';
  emptyMessage: string;
  /** Owner is worth a column in a full-width list and not in a third-width
   *  one, where it clips rather than informs. The narrow list drops it. */
  showOwner?: boolean;
}

function seatsLabel(row: UsageAccount) {
  if (row.active_seats === null || row.contracted_seats === null) return '—';
  return `${row.active_seats.toLocaleString()} / ${row.contracted_seats.toLocaleString()}`;
}

/**
 * A work list of accounts, ranked by money.
 *
 * Two instances on this screen: what to fix (shelfware) and what to sell
 * (capacity). One component because they differ only in which money column
 * leads — and a second copy is how the two would drift into disagreeing about
 * what a seat count looks like.
 */
export function AccountUsageList({
  title,
  subtitle,
  rows,
  currency,
  moneyColumn,
  emptyMessage,
  showOwner = true,
}: AccountUsageListProps) {
  return (
    <div className="w-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">{subtitle}</p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">{emptyMessage}</p>
      ) : (
        // Scrolls inside its card with the header pinned, instead of growing
        // the page by every account in the list.
        <ScrollTable caption={title} maxHeight={420} className="mx-2 mb-3 mt-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                {[
                  'Account',
                  'Used',
                  'Seats',
                  moneyColumn === 'shelfware' ? 'Idle ARR' : 'ARR',
                  ...(showOwner ? ['Owner'] : []),
                ].map((heading) => (
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
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: BAND_COLORS[row.band ?? ''] ?? FALLBACK_COLOR }}
                        aria-hidden
                      />
                      <span className="text-[12.5px] font-medium text-ink">{row.name}</span>
                    </div>
                    {/* The band in words: the dot's colour is its only other
                        mark, and colour alone is not a key. */}
                    <p className="text-[10.5px] text-ink-faint mt-[1px]">
                      {row.band && BAND_SHORT[row.band] ? `${BAND_SHORT[row.band]} · ` : ''}
                      {row.lifecycle_stage}
                      {row.products > 0 &&
                        ` · ${row.products} ${row.products === 1 ? 'product' : 'products'}`}
                    </p>
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink tabular-nums whitespace-nowrap">
                    {row.utilisation === null ? '—' : `${row.utilisation}%`}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink-muted tabular-nums whitespace-nowrap">
                    {seatsLabel(row)}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] font-semibold text-ink tabular-nums whitespace-nowrap">
                    {/* An unpriced account shows a dash, never a zero: the
                        contract has a value, we just can't state it in this
                        currency. */}
                    {moneyColumn === 'shelfware'
                      ? row.arr === null
                        ? '—'
                        : formatMoney(row.shelfware_arr, currency)
                      : row.arr === null
                        ? '—'
                        : formatMoney(row.arr, currency)}
                  </td>
                  {showOwner && (
                    <td className="px-2 py-[7px] text-[12px] text-ink-muted whitespace-nowrap">
                      {row.owner}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
    </div>
  );
}

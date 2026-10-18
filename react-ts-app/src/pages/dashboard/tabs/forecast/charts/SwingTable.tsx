import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { SwingAccount } from '../../../../../features/forecast/forecastSlice';
import { formatMoney } from '../../../../../features/customers/formatters';
import { ScrollTable } from '../../../shared/ScrollTable';

const HEALTH_STYLE: Record<SwingAccount['health_category'], string> = {
  good: 'bg-success-dim text-success',
  average: 'bg-warning-dim text-warning',
  poor: 'bg-danger-dim text-danger',
};

const HEALTH_LABEL: Record<SwingAccount['health_category'], string> = {
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
};

function renewalLabel(row: SwingAccount) {
  if (row.days_to_renewal === null) return 'no date';
  if (row.days_to_renewal < 0) return `${Math.abs(row.days_to_renewal)}d overdue`;
  return `in ${row.days_to_renewal}d`;
}

export interface SwingTableProps {
  rows: SwingAccount[];
  currency: CurrencyCode;
}

/**
 * The accounts that decide the number, in both directions.
 *
 * One list rather than a downside list and an upside list, because a forecast
 * review works one list of names — and an account that is both a large renewal
 * risk and a large expansion is exactly the one to talk about first, which two
 * lists would bury in each of them.
 *
 * Each row shows the factors behind its risk, the same bet the Renewal tab
 * makes and now literally the same numbers: both read the backend's shared
 * churn rule rather than deriving their own.
 */
export function SwingTable({ rows, currency }: SwingTableProps) {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">What moves the number</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          Accounts ranked by how far they push the forecast, up or down
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">
          Nothing in this selection moves the forecast: no renewals at risk and no open pipeline.
        </p>
      ) : (
        <ScrollTable caption="What moves the number" maxHeight={420} minWidth={620} className="mx-2 mb-3 mt-2">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                {['Account', 'Renews', 'ARR', 'Risk', 'Downside', 'Expansion', 'Net'].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-line-subtle hover:bg-subtle/60 transition-colors"
                >
                  <td className="px-2 py-[7px] max-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-[1px] rounded text-[10px] font-bold shrink-0 ${HEALTH_STYLE[row.health_category]}`}
                      >
                        {HEALTH_LABEL[row.health_category]}
                      </span>
                      <span className="text-[12.5px] font-medium text-ink truncate">
                        {row.name}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-ink-faint truncate mt-[1px]">
                      {row.factors.map((factor) => factor.label).join(' · ')}
                    </p>
                  </td>
                  <td
                    className={`px-2 py-[7px] text-[12px] tabular-nums whitespace-nowrap ${
                      (row.days_to_renewal ?? 0) < 0 ? 'text-danger font-bold' : 'text-ink-muted'
                    }`}
                  >
                    {/* An account renewing beyond the horizon can't churn in
                        it, so its date is shown faintly rather than as a
                        pending event. */}
                    <span className={row.renews_in_horizon ? '' : 'text-ink-faint'}>
                      {renewalLabel(row)}
                    </span>
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink tabular-nums whitespace-nowrap">
                    {row.arr === null ? '—' : formatMoney(row.arr, currency)}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink-muted tabular-nums whitespace-nowrap">
                    {Math.round(row.risk * 100)}%
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-danger tabular-nums whitespace-nowrap">
                    {row.downside > 0 ? `−${formatMoney(row.downside, currency)}` : '—'}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-success tabular-nums whitespace-nowrap">
                    {row.expansion > 0 ? `+${formatMoney(row.expansion, currency)}` : '—'}
                  </td>
                  <td
                    className={`px-2 py-[7px] text-[12px] font-semibold tabular-nums whitespace-nowrap ${
                      row.net < 0 ? 'text-danger' : 'text-success'
                    }`}
                  >
                    {row.net >= 0 ? '+' : '−'}
                    {formatMoney(Math.abs(row.net), currency)}
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

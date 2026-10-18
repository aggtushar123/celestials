import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { HealthStatus } from '../../../../../features/health/types';
import { formatMoney } from '../../../../../features/customers/formatters';
import type { Coverage, RenewalRow } from '../renewal';
import { ChartLegend } from '../../../shared/ChartLegend';
import { COVERAGE_SERIES } from './coverageSeries';

/** The two contact ages the Last contact column colours; fresh and unknown
 *  stay in plain ink, so they need no key. */
const CONTACT_KEY = COVERAGE_SERIES.filter((series) => series.key === 'cold' || series.key === 'ageing').map(
  ({ label, color }) => ({ label, color }),
);

const STATUS_STYLE: Record<HealthStatus, string> = {
  Good: 'bg-success-dim text-success',
  Average: 'bg-warning-dim text-warning',
  Poor: 'bg-danger-dim text-danger',
};

const COVERAGE_STYLE: Record<Coverage, string> = {
  fresh: 'text-ink-muted',
  ageing: 'text-warning',
  cold: 'text-danger font-bold',
  unknown: 'text-ink-faint',
};

function contactLabel(item: RenewalRow) {
  if (item.row.daysSinceTouch === null) return 'never';
  return `${item.row.daysSinceTouch}d ago`;
}

function dueLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'today';
  return `in ${days}d`;
}

export interface RenewalQueueTableProps {
  queue: RenewalRow[];
  currency: CurrencyCode;
  /** How many rows to show. The rest are counted in the footer. */
  limit?: number;
}

/**
 * The work list: renewals ranked by expected loss.
 *
 * Ranked by ARR × risk rather than by either alone — the largest contract is
 * not the one most likely to leave, and the sickest account may be worth a
 * rounding error. The factors that produced each risk are shown on the row,
 * because a ranking nobody can interrogate is a ranking nobody acts on; the
 * Triage tab makes the same bet for the same reason.
 */
export function RenewalQueueTable({ queue, currency, limit = 12 }: RenewalQueueTableProps) {
  const shown = queue.slice(0, limit);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">Work list</h3>
          <p className="text-[11px] text-ink-faint mt-[1px]">
            Renewals in the next 90 days, highest expected loss first
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] text-ink-faint">Last contact</span>
            <ChartLegend items={CONTACT_KEY} />
          </div>
        </div>
        {queue.length > shown.length && (
          <p className="text-[11px] text-ink-faint shrink-0">
            showing {shown.length} of {queue.length}
          </p>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">
          No renewals inside 90 days. The calendar above is where the next ones land.
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto px-2 pb-3 pt-2">
          <table className="w-full border-collapse">
            {/* Sticky, not ScrollTable: the queue is capped at `limit` rows, so
                there is nothing to scroll to in the normal case, and this list
                is exactly the "bounded list, no scroll wrapper" case the kit
                carves out. The header still pins on the surface colour for the
                rare case where the card ends up shorter than its rows. */}
            <thead>
              <tr className="text-left">
                {['Account', 'Renews', 'ARR', 'Risk', 'Exposure', 'Last contact', 'Owner'].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="sticky top-0 z-10 bg-surface px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr
                  key={item.row.id}
                  className="border-t border-line-subtle hover:bg-subtle/60 transition-colors"
                >
                  <td className="px-2 py-[7px] max-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-[1px] rounded text-[10px] font-bold shrink-0 ${STATUS_STYLE[item.row.healthStatus]}`}
                      >
                        {item.row.healthStatus}
                      </span>
                      <span className="text-[12.5px] font-medium text-ink truncate">
                        {item.row.account}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-ink-faint truncate mt-[1px]">
                      {item.factors.map((factor) => factor.label).join(' · ')}
                    </p>
                  </td>
                  <td
                    className={`px-2 py-[7px] text-[12px] whitespace-nowrap tabular-nums ${
                      item.days < 0 ? 'text-danger font-bold' : 'text-ink-muted'
                    }`}
                  >
                    {dueLabel(item.days)}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink tabular-nums whitespace-nowrap">
                    {/* An unconvertible ARR is a dash, not a zero: the contract
                        has a value, we just can't state it in this currency. */}
                    {item.row.arr === null ? '—' : formatMoney(item.row.arr, currency)}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink-muted tabular-nums whitespace-nowrap">
                    {Math.round(item.risk * 100)}%
                  </td>
                  <td className="px-2 py-[7px] text-[12px] font-semibold text-ink tabular-nums whitespace-nowrap">
                    {item.exposure === null ? '—' : formatMoney(item.exposure, currency)}
                  </td>
                  <td
                    className={`px-2 py-[7px] text-[12px] tabular-nums whitespace-nowrap ${COVERAGE_STYLE[item.coverage]}`}
                  >
                    {contactLabel(item)}
                  </td>
                  <td className="px-2 py-[7px] text-[12px] text-ink-muted truncate max-w-[140px]">
                    {item.row.owner}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

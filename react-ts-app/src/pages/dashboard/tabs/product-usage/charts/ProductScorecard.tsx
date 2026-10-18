import type { CurrencyCode } from '../../../../../features/auth/authSlice';
import type { ProductRow } from '../../../../../features/products/productsSlice';
import { formatCompactMoney } from '../../../../../features/customers/formatters';
import { ROLE } from '../../../shared/chartPalette';
import { ChartLegend } from '../../../shared/ChartLegend';
import { ScrollTable } from '../../../shared/ScrollTable';

export interface ProductScorecardProps {
  rows: ProductRow[];
  currency: CurrencyCode;
}

/** Unmeasured prints as a dash. A product nobody surveyed has no score, and a
 *  zero would rank it below a product customers actively dislike. */
const dash = (value: number | null, suffix = '') =>
  value === null ? '—' : `${value}${suffix}`;

const npsTone = (nps: number | null) =>
  nps === null ? 'text-ink-faint' : nps < 0 ? 'text-danger' : nps < 30 ? 'text-warning' : 'text-success';

const cesTone = (ces: number | null) =>
  ces === null ? 'text-ink-faint' : ces < 50 ? 'text-danger' : ces < 75 ? 'text-warning' : 'text-success';

/**
 * The side-by-side comparison: every product on one row, every measure in its
 * own column.
 *
 * Deliberately a table rather than a chart. These measures are in four
 * different units — seats, a 0-100 ease score, a -100..100 promoter score, a
 * ticket count — and any chart that puts them on shared axes has to normalise
 * them, which invents a ranking the data doesn't support. Read down a column
 * to compare products on one measure; read across a row to see a product's
 * whole story.
 *
 * Utilisation gets the only bar, because it is the one measure with a natural
 * ceiling to compare against.
 */
export function ProductScorecard({ rows, currency }: ProductScorecardProps) {
  const unpriced = rows.reduce((total, row) => total + row.unpriced, 0);

  return (
    <div className="w-full flex flex-col">
      <div className="px-4 pt-3">
        <h3 className="text-[13px] font-bold text-ink">Product by product</h3>
        <p className="text-[11px] text-ink-faint mt-[1px]">
          Every measure in its own unit — read down a column to compare products, across a row for
          one product's story
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[12px] text-ink-faint">No products match these filters.</p>
      ) : (
        <ScrollTable caption="Product by product" maxHeight={420} minWidth={680} className="mx-2 mb-2">
          <table className="w-full text-[11.5px] border-collapse">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                <th className="text-left font-bold px-2 py-2">Product</th>
                <th className="text-right font-bold px-2 py-2">Customers</th>
                <th className="text-right font-bold px-2 py-2">ARR led</th>
                <th className="text-left font-bold px-2 py-2 w-[140px]">Seat use</th>
                <th className="text-right font-bold px-2 py-2">Healthy</th>
                <th className="text-right font-bold px-2 py-2">CES</th>
                <th className="text-right font-bold px-2 py-2">NPS</th>
                <th className="text-right font-bold px-2 py-2">Open tickets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id ?? "none"} className="border-t border-line-subtle">
                  <td className="px-2 py-[7px] font-semibold text-ink">
                    {row.product}
                    {row.customers === 0 && (
                      // Two different stories, and the churn figures tell
                      // them apart: a product whose customers all left, and
                      // one nobody in this selection is on.
                      <span
                        className={`ml-1.5 text-[10px] font-bold ${
                          row.churned > 0 ? 'text-danger' : 'text-ink-faint'
                        }`}
                      >
                        {row.churned > 0 ? 'nobody left' : 'nobody on it'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-[7px] text-right tabular-nums text-ink-muted">
                    {row.customers}
                  </td>
                  <td className="px-2 py-[7px] text-right tabular-nums text-ink">
                    {formatCompactMoney(row.arr, currency)}
                    <span className="text-ink-faint"> · {row.share}%</span>
                  </td>
                  <td className="px-2 py-[7px]">
                    {row.utilisation === null ? (
                      <span className="text-ink-faint">no seats recorded</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-[8px] rounded-[3px] bg-subtle overflow-hidden">
                          <div
                            className={`h-full rounded-[3px] ${
                              row.utilisation >= 90
                                ? 'bg-warning'
                                : row.utilisation < 50
                                  ? 'bg-danger/70'
                                  : 'bg-ink-faint'
                            }`}
                            style={{ width: `${Math.min(100, row.utilisation)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-ink-muted shrink-0 w-[38px] text-right">
                          {row.utilisation}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-[7px] text-right tabular-nums text-ink-muted">
                    {row.healthy_share === null
                      ? '—'
                      : `${row.health.good}/${row.customers}`}
                  </td>
                  <td className={`px-2 py-[7px] text-right tabular-nums font-semibold ${cesTone(row.ces)}`}>
                    {dash(row.ces)}
                  </td>
                  <td className={`px-2 py-[7px] text-right tabular-nums font-semibold ${npsTone(row.nps)}`}>
                    {dash(row.nps)}
                  </td>
                  <td className="px-2 py-[7px] text-right tabular-nums text-ink-muted">
                    {row.open_tickets}
                    {/* No per-customer figure on a row with nobody left — "—
                        each" beside a zero says nothing twice. */}
                    {row.tickets_per_customer !== null && (
                      <span className="text-ink-faint"> · {row.tickets_per_customer} each</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}

      {rows.length > 0 && (
        // What the colours in the table mean, so none of them is colour alone.
        <div className="px-4 pb-3 flex flex-col gap-1">
          <ChartLegend
            items={[
              { label: 'Seat use under 50%', color: ROLE.loss },
              { label: 'Seat use 90% or more', color: ROLE.caution },
            ]}
          />
          <ChartLegend
            items={[
              { label: 'Poor: CES under 50, NPS under 0', color: ROLE.loss },
              { label: 'Fair: CES under 75, NPS under 30', color: ROLE.caution },
              { label: 'Good: above both', color: ROLE.gain },
            ]}
          />
        </div>
      )}

      {unpriced > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[10.5px] text-warning">
            {unpriced} customer{unpriced === 1 ? '' : 's'} counted in every seat and health figure
            and in none of the money ones — no exchange rate for their contract currency.
          </p>
        </div>
      )}
    </div>
  );
}

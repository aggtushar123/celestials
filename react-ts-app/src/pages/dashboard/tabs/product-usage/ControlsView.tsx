import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { fetchProductUsage } from '../../../../features/products/productsSlice';
import { formatCompactMoney } from '../../../../features/customers/formatters';
import { Kpi, KpiStrip } from '../../shared/Kpi';
import { ProductMoneyChart } from './charts/ProductMoneyChart';
import { ProductChurnChart } from './charts/ProductChurnChart';
import { ProductScorecard } from './charts/ProductScorecard';

/** The filter query string, handed down by ProductUsageContainer's bar. */
export interface ProductUsageContext {
  query: string;
}

/**
 * Product Usage: which products carry the book, and how are the customers on
 * each one doing?
 *
 * Not a second Usage Overview. That screen reads seats across the whole book
 * for a CS team working accounts; this one compares products against each
 * other for someone deciding what to build, fix or retire.
 *
 * The attribution note sits above the numbers rather than under them, because
 * it changes what every figure on the screen means: only a customer's
 * *primary* product is recorded, so this is "customers led by this product",
 * never revenue split across products. A reader who misses that line draws
 * conclusions the data cannot support, which is why it is a banner and not a
 * footnote.
 */
export function ControlsView() {
  const dispatch = useAppDispatch();
  const { stats, isLoading, error } = useAppSelector((state) => state.products);

  const context = useOutletContext<ProductUsageContext | undefined>();
  const query = context?.query ?? '';

  useEffect(() => {
    dispatch(fetchProductUsage(query));
  }, [dispatch, query]);

  const kpis = stats?.kpis;
  const currency = stats?.currency ?? 'USD';
  const money = (value: number) => formatCompactMoney(value, currency);

  return (
    <div className="w-full flex flex-col gap-4 pb-12">
      {error && (
        <p className="text-[12.5px] font-semibold text-danger" role="alert">
          {error}
        </p>
      )}

      {stats && (
        <p className="text-[11px] text-ink-muted bg-subtle border border-line-subtle rounded-lg px-3 py-2">
          <span className="font-bold text-ink">How to read this: </span>
          Every figure counts customers whose <em>primary</em> product this is. Only the primary
          product is recorded per customer, so a customer on several products is counted once, here
          — this is not revenue split across products.
        </p>
      )}

      {stats && stats.rows.length === 0 && !isLoading && (
        <p className="text-[12.5px] text-ink-faint">
          No products on this organisation's list yet, and no customers to put on them.
        </p>
      )}

      {kpis && kpis.without_customers.length > 0 && (
        <p className="text-[11px] text-ink-faint px-2">
          {/* Deliberately "in this selection": the rows are the whole product
              list while the customers are the caller's own book plus whatever
              filters are set, so this is not a claim that nobody bought it. */}
          Nobody in this selection is on {kpis.without_customers.join(', ')}.
        </p>
      )}

      <div
        className={`w-full flex flex-col gap-4 transition-opacity ${
          isLoading && stats ? 'opacity-60' : ''
        }`}
      >
        <KpiStrip>
          <Kpi
            label="Products"
            value={kpis ? String(kpis.products) : '—'}
            detail={
              kpis
                ? `${kpis.customers} ${kpis.customers === 1 ? 'customer' : 'customers'} · ${money(kpis.arr)} led`
                : 'loading'
            }
          />
          <Kpi
            label="Largest"
            value={kpis?.largest ? `${kpis.largest.share}%` : '—'}
            detail={
              kpis?.largest
                ? `${kpis.largest.product} · ${money(kpis.largest.arr)}`
                : 'no priced customers'
            }
          />
          <Kpi
            label="Most at stake"
            value={kpis?.weakest ? money(kpis.weakest.unhealthy_arr) : '—'}
            detail={
              kpis?.weakest
                ? `${kpis.weakest.product} · ${kpis.weakest.healthy ?? 0} of ${kpis.weakest.customers} healthy`
                : 'every product is in good health'
            }
            tone={kpis?.weakest ? 'loss' : 'neutral'}
          />
          <Kpi
            label="Worst churn"
            value={kpis?.worst_churn ? money(kpis.worst_churn.churned_arr) : '—'}
            detail={
              kpis?.worst_churn
                ? `${kpis.worst_churn.product} · ${kpis.worst_churn.churned} left`
                : 'no churn on any product'
            }
            tone={kpis?.worst_churn ? 'loss' : 'neutral'}
          />
        </KpiStrip>

        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[400px]">
          {stats && <ProductMoneyChart rows={stats.rows} currency={currency} />}
        </div>

        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
          <ProductScorecard rows={stats?.rows ?? []} currency={currency} />
        </div>

        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
          {stats && <ProductChurnChart rows={stats.rows} currency={currency} />}
        </div>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { fetchPortfolio } from '../../../../features/portfolio/portfolioSlice';
import { formatCompactMoney } from '../../../../features/customers/formatters';
import { Kpi, KpiStrip } from '../../shared/Kpi';
import { ConcentrationChart } from './charts/ConcentrationChart';
import { CohortChart } from './charts/CohortChart';
import { ChurnReasonList } from './charts/ChurnReasonList';
import { CompositionSplit } from './charts/CompositionSplit';
import { useDrill } from '../../drill/useDrill';

/** The filter query string, handed down by CustomerOverviewContainer's bar. */
export interface CustomerOverviewContext {
  query: string;
}

/**
 * Customer Overview: what the book is made of.
 *
 * The only screen here that counts customers you no longer have — which is
 * what makes logo retention, cohort survival and churn reasons possible at
 * all. Every other dashboard asks how the customers you *have* are doing.
 *
 * Composition first (how many, how big), then exposure (concentration), then
 * history (cohorts, and why the leavers left).
 */
export function ControlsView() {
  const dispatch = useAppDispatch();
  const { stats, isLoading, error } = useAppSelector((state) => state.portfolio);
  const { open } = useDrill();

  const context = useOutletContext<CustomerOverviewContext | undefined>();
  const query = context?.query ?? '';

  useEffect(() => {
    dispatch(fetchPortfolio(query));
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

      {stats && kpis && kpis.active === 0 && kpis.churned === 0 && !isLoading && (
        <p className="text-[12.5px] text-ink-faint">No customers match these filters.</p>
      )}

      {kpis && kpis.unpriced > 0 && (
        <p className="text-[11px] text-warning px-2">
          {kpis.unpriced} customer{kpis.unpriced === 1 ? '' : 's'} counted in the logo figures and
          in none of the money ones — no exchange rate for their contract currency.
        </p>
      )}

      <div
        className={`w-full flex flex-col gap-4 transition-opacity ${
          isLoading && stats ? 'opacity-60' : ''
        }`}
      >
        <KpiStrip>
          <Kpi
            label="Customers"
            value={kpis ? String(kpis.active) : '—'}
            detail={
              kpis
                ? `${money(kpis.active_arr)}${kpis.average_arr !== null ? ` · ${money(kpis.average_arr)} average` : ''}`
                : 'loading'
            }
          />
          <Kpi
            label="Logo retention"
            value={
              kpis?.logo_retention === null || kpis === undefined
                ? '—'
                : `${kpis.logo_retention}%`
            }
            detail={
              kpis ? `${kpis.churned} of ${kpis.active + kpis.churned} ever signed have left` : 'loading'
            }
          />
          <Kpi
            label="Churned in 12 months"
            value={kpis ? String(kpis.churned_12m) : '—'}
            detail={
              kpis
                ? `${money(kpis.churned_arr_12m)} left · ${money(kpis.churned_arr)} all time`
                : 'loading'
            }
            tone={kpis && kpis.churned_12m > 0 ? 'loss' : 'neutral'}
            onDrill={
              kpis && !isLoading
                ? (trigger) =>
                    open(
                      {
                        title: 'Churned in 12 months',
                        figure: String(kpis.churned_12m),
                        source: {
                          kind: 'server',
                          path: '/customers/overview/',
                          query,
                          segment: 'churned_12m',
                        },
                      },
                      trigger,
                    )
                : undefined
            }
          />
          <Kpi
            label="Top 3 concentration"
            value={
              stats?.concentration.top_three_share === null ||
              stats?.concentration.top_three_share === undefined
                ? '—'
                : `${stats.concentration.top_three_share}%`
            }
            detail="of ARR in the three largest accounts"
            onDrill={
              // Only when there is a share to explain and accounts behind it.
              stats && stats.concentration.top_three_share !== null && stats.concentration.rows.length > 0
                ? (trigger) =>
                    open(
                      {
                        title: 'Top 3 concentration',
                        figure:
                          stats.concentration.top_three_share === null
                            ? '—'
                            : `${stats.concentration.top_three_share}%`,
                        source: {
                          kind: 'rows',
                          // Exactly the three accounts the share sums over —
                          // complete by construction, never the whole ranked list.
                          rows: stats.concentration.rows.slice(0, 3).map((row) => ({
                            id: String(row.id),
                            name: row.name,
                            owner: row.owner,
                            arr: row.arr,
                            detail: `${row.share}% of ARR`,
                          })),
                        },
                      },
                      trigger,
                    )
                : undefined
            }
          />
        </KpiStrip>

        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[400px]">
          {stats && (
            <ConcentrationChart concentration={stats.concentration} currency={currency} />
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 [&>*]:min-w-0">
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[300px]">
            <CohortChart
              rows={stats?.cohorts.rows ?? []}
              undated={stats?.cohorts.undated ?? 0}
            />
          </div>
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden max-h-[300px]">
            <ChurnReasonList reasons={stats?.churn_reasons ?? []} currency={currency} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 [&>*]:min-w-0">
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
            <CompositionSplit
              title="By size"
              subtitle="Active customers per ARR band — the smallest band is usually the most logos and the least money"
              rows={stats?.segments.rows ?? []}
              currency={currency}
              unplaced={stats?.segments.unplaced ?? 0}
              emptyMessage="No active customers in this selection."
            />
          </div>
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
            <CompositionSplit
              title="By lifecycle stage"
              subtitle="Where the active book sits today"
              rows={stats?.lifecycle ?? []}
              currency={currency}
              emptyMessage="No active customers in this selection."
            />
          </div>
        </div>
      </div>
    </div>
  );
}

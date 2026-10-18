import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { fetchUsageStats } from '../../../../features/usage/usageSlice';
import { formatCompactMoney } from '../../../../features/customers/formatters';
import { Kpi, KpiStrip } from '../../shared/Kpi';
import { UtilisationBandChart } from './charts/UtilisationBandChart';
import { UsageScatter } from './charts/UsageScatter';
import { AccountUsageList } from './charts/AccountUsageList';
import { AdoptionBreadthChart } from './charts/AdoptionBreadthChart';
import { useDrill } from '../../drill/useDrill';
import { fromUsageRows } from '../../drill/rows';

/** The filter query string, handed down by UsageOverviewContainer's own bar. */
export interface UsageOverviewContext {
  query: string;
}

/**
 * Usage Overview: what the book pays for, against what it uses.
 *
 * Four tiles for the size of the question, then the shape of the book, then
 * the two lists that do something about it — fix the shelfware, sell into the
 * capacity. Every figure comes from the server (see `/customers/usage/`), so
 * the charts and the lists can't disagree about a threshold.
 */
export function ControlsView() {
  const dispatch = useAppDispatch();
  const { stats, isLoading, error } = useAppSelector((state) => state.usage);
  const { open } = useDrill();

  const context = useOutletContext<UsageOverviewContext | undefined>();
  const query = context?.query ?? '';

  useEffect(() => {
    dispatch(fetchUsageStats(query));
  }, [dispatch, query]);

  const kpis = stats?.kpis;
  const currency = stats?.currency ?? 'USD';
  const money = (value: number) => formatCompactMoney(value, currency);

  // The backend caps `scatter` at 500 rows while the KPIs above cover every
  // measured account — there's no `truncated` flag on this payload, but
  // `kpis.measured_count` (always the real, untruncated total) says the same
  // thing when it's larger than the list we actually got. A drill from a
  // short list would only ever show *some* of the accounts a figure counted,
  // so every Kpi/chart drill on this view stays off until we know the list
  // is the whole story — "not yet loaded" counts as "don't know", not as
  // "complete", so a loading tile never renders a button that a moment
  // later, once truncation is known, would have to un-render.
  const scatterComplete = !!stats && !!kpis && stats.scatter.length >= kpis.measured_count;

  return (
    <div className="w-full flex flex-col gap-4 pb-12">
      {error && (
        <p className="text-[12.5px] font-semibold text-danger" role="alert">
          {error}
        </p>
      )}

      {stats && kpis && kpis.accounts === 0 && !isLoading && (
        <p className="text-[12.5px] text-ink-faint">No accounts match these filters.</p>
      )}

      {/* Dimmed rather than replaced while a refetch runs: changing a filter
          shouldn't blank the dashboard, and the numbers on screen are still
          the last true ones. */}
      <div
        className={`w-full flex flex-col gap-4 transition-opacity ${
          isLoading && stats ? 'opacity-60' : ''
        }`}
      >
        <KpiStrip>
          <Kpi
            label="Seat utilisation"
            value={kpis?.utilisation === null || kpis === undefined ? '—' : `${kpis.utilisation}%`}
            detail={
              kpis
                ? `${kpis.active_seats.toLocaleString()} of ${kpis.contracted_seats.toLocaleString()} seats active`
                : 'loading'
            }
            onDrill={
              scatterComplete
                ? (trigger) => {
                    if (!stats || !kpis || kpis.utilisation === null) return;
                    open(
                      {
                        title: 'Seat utilisation',
                        figure: `${kpis.utilisation}%`,
                        source: {
                          kind: 'rows',
                          // The whole book, not a threshold — the figure is a
                          // ratio computed over every measured account, so
                          // that's the population that explains it.
                          rows: fromUsageRows(stats.scatter, (r) => `${r.utilisation ?? 0}% used`),
                        },
                      },
                      trigger,
                    );
                  }
                : undefined
            }
          />
          <Kpi
            label="Shelfware"
            value={kpis ? money(kpis.shelfware_arr) : '—'}
            detail={
              kpis ? `${kpis.idle_seats.toLocaleString()} idle seats, below 75% used` : 'loading'
            }
            onDrill={
              scatterComplete
                ? (trigger) => {
                    if (!stats || !kpis) return;
                    open(
                      {
                        title: 'Shelfware',
                        figure: money(kpis.shelfware_arr),
                        source: {
                          kind: 'rows',
                          rows: fromUsageRows(
                            stats.scatter.filter((r) => r.shelfware_arr > 0),
                            // The figure is idle ARR, which a row's own
                            // trailing (contract) ARR doesn't add up to — so
                            // the detail carries the number that does.
                            (r) =>
                              `${money(r.shelfware_arr)} idle · ${r.idle_seats.toLocaleString()} idle seat${r.idle_seats === 1 ? '' : 's'}`,
                          ),
                        },
                      },
                      trigger,
                    );
                  }
                : undefined
            }
          />
          <Kpi
            label="At capacity"
            value={kpis ? money(kpis.at_capacity_arr) : '—'}
            detail={
              kpis
                ? `${kpis.at_capacity_count} ${kpis.at_capacity_count === 1 ? 'account is' : 'accounts are'} out of room`
                : 'loading'
            }
            onDrill={
              scatterComplete
                ? (trigger) => {
                    if (!stats || !kpis) return;
                    open(
                      {
                        title: 'At capacity',
                        figure: money(kpis.at_capacity_arr),
                        source: {
                          kind: 'rows',
                          rows: fromUsageRows(
                            stats.scatter.filter((r) => (r.utilisation ?? 0) >= 90),
                            (r) => `${r.utilisation}% used`,
                          ),
                        },
                      },
                      trigger,
                    );
                  }
                : undefined
            }
          />
          <Kpi
            label="No seat data"
            value={kpis ? String(kpis.unmeasured_count) : '—'}
            detail={
              kpis
                ? `of ${kpis.accounts} accounts · absent from every figure here`
                : 'loading'
            }
            // Not drillable: these accounts have no seat data at all, so they
            // aren't in `scatter` — there is no rows/predicate over that list
            // that reproduces them.
          />
        </KpiStrip>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 [&>*]:min-w-0">
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
            <UtilisationBandChart
              bands={stats?.bands ?? []}
              scatter={stats?.scatter ?? []}
              currency={currency}
              unmeasured={kpis?.unmeasured_count ?? 0}
              drillable={scatterComplete}
            />
          </div>
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
            <UsageScatter points={stats?.scatter ?? []} currency={currency} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 [&>*]:min-w-0">
          <div className="xl:col-span-2 bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
            <AccountUsageList
              title="Shelfware — what to fix"
              subtitle="Most ARR attached to seats nobody uses, biggest first"
              rows={stats?.shelfware ?? []}
              currency={currency}
              moneyColumn="shelfware"
              emptyMessage="Nothing in this selection is below 75% used."
            />
          </div>
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
            <AccountUsageList
              title="At capacity — what to sell"
              subtitle="Accounts out of seats, largest first"
              rows={stats?.at_capacity ?? []}
              currency={currency}
              moneyColumn="arr"
              emptyMessage="Nobody in this selection is near their seat count."
              showOwner={false}
            />
          </div>
        </div>

        <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
          <AdoptionBreadthChart buckets={stats?.adoption ?? []} currency={currency} />
        </div>
      </div>
    </div>
  );
}

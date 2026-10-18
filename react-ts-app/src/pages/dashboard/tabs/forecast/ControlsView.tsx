import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { fetchForecast } from '../../../../features/forecast/forecastSlice';
import { formatCompactMoney } from '../../../../features/customers/formatters';
import { Kpi, KpiStrip } from '../../shared/Kpi';
import { ArrBridgeChart } from './charts/ArrBridgeChart';
import { ScenarioRange } from './charts/ScenarioRange';
import { PipelineByStage } from './charts/PipelineByStage';
import { SwingTable } from './charts/SwingTable';
import { useDrill } from '../../drill/useDrill';

/** The filter query string, handed down by ForecastContainer's own bar. */
export interface ForecastContext {
  query: string;
}

/**
 * Revenue Forecast: what the book is worth a year out, and what moves it.
 *
 * The financial read of the same accounts the Health Overview works
 * operationally. Opening ARR, the three things that move it, and the range
 * around the answer — then the accounts responsible, so the number leads
 * somewhere.
 *
 * Every weighting here is the backend's, including the churn rule the Renewal
 * Date tab prints on its own rows. That is the point of it living there: this
 * screen and that one make the same claim about the same account.
 */
export function ControlsView() {
  const dispatch = useAppDispatch();
  const { stats, isLoading, error } = useAppSelector((state) => state.forecast);
  const { open } = useDrill();

  const context = useOutletContext<ForecastContext | undefined>();
  const query = context?.query ?? '';

  useEffect(() => {
    dispatch(fetchForecast(query));
  }, [dispatch, query]);

  const currency = stats?.currency ?? 'USD';
  const money = (value: number) => formatCompactMoney(value, currency);
  const bridge = stats?.bridge;

  return (
    <div className="w-full flex flex-col gap-4 pb-12">
      {error && (
        <p className="text-[12.5px] font-semibold text-danger" role="alert">
          {error}
        </p>
      )}

      {stats && stats.accounts === 0 && !isLoading && (
        <p className="text-[12.5px] text-ink-faint">No accounts match these filters.</p>
      )}

      {stats && stats.unpriced_count > 0 && (
        <p className="text-[11px] text-warning px-2">
          {stats.unpriced_count} account{stats.unpriced_count === 1 ? '' : 's'} excluded from every
          figure below — no exchange rate for their contract currency.
        </p>
      )}

      <div
        className={`w-full flex flex-col gap-4 transition-opacity ${
          isLoading && stats ? 'opacity-60' : ''
        }`}
      >
        <KpiStrip>
          <Kpi
            label="ARR today"
            value={bridge ? money(bridge.opening_arr) : '—'}
            detail={
              stats
                ? `${stats.accounts} accounts · ${stats.renewing_count} renew in this window`
                : 'loading'
            }
          />
          <Kpi
            label="Forecast ARR"
            value={bridge ? money(bridge.forecast_arr) : '—'}
            detail={
              bridge
                ? `${bridge.net_change >= 0 ? '+' : ''}${money(bridge.net_change)} against today`
                : 'loading'
            }
          />
          <Kpi
            label="Net revenue retention"
            value={bridge?.nrr === null || bridge === undefined ? '—' : `${bridge.nrr}%`}
            detail="before any new logos"
          />
          <Kpi
            label="At risk"
            value={bridge ? money(bridge.churn + bridge.contraction) : '—'}
            detail="weighted churn and contraction"
            tone="loss"
            onDrill={
              bridge && !isLoading
                ? (trigger) =>
                    open(
                      {
                        title: 'At risk',
                        figure: money(bridge.churn + bridge.contraction),
                        source: { kind: 'server', path: '/customers/forecast/', query, segment: 'at_risk' },
                      },
                      trigger,
                    )
                : undefined
            }
          />
        </KpiStrip>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 [&>*]:min-w-0">
          <div className="xl:col-span-2 bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
            {bridge && (
              <ArrBridgeChart
                bridge={bridge}
                currency={currency}
                horizonDays={stats?.horizon_days ?? 365}
                query={query}
                drillable={!isLoading}
              />
            )}
          </div>
          {/* Top-aligned: the range is short, and stretched to the bridge's
              height it floated in empty space. */}
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden xl:self-start">
            {stats && (
              <ScenarioRange
                scenarios={stats.scenarios}
                opening={stats.bridge.opening_arr}
                currency={currency}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 [&>*]:min-w-0">
          <div className="xl:col-span-2 bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
            <SwingTable rows={stats?.swing ?? []} currency={currency} />
          </div>
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden max-h-[420px]">
            <PipelineByStage stages={stats?.pipeline ?? []} currency={currency} />
          </div>
        </div>
      </div>
    </div>
  );
}

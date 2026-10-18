import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { fetchActivityStats } from '../../../../features/activity/activitySlice';
import { formatCompactMoney } from '../../../../features/customers/formatters';
import { Kpi, KpiStrip } from '../../shared/Kpi';
import { TouchTimeline } from './charts/TouchTimeline';
import { CadenceChart } from './charts/CadenceChart';
import { OwnerCoverageList } from './charts/OwnerCoverageList';
import { GoingDarkTable } from './charts/GoingDarkTable';
import { useDrill } from '../../drill/useDrill';

/** The filter query string, handed down by ActivityContainer's own bar. */
export interface ActivityContext {
  query: string;
}

/**
 * Activity Tracking: is the team working the book, and where isn't it?
 *
 * Volume first, then cadence, then the two views that assign it — per book,
 * and the accounts that have gone quiet. An operations review rather than a
 * voice-of-customer one: AI Trending Topics answers what customers are saying,
 * this answers what we did about it.
 */
export function ControlsView() {
  const dispatch = useAppDispatch();
  const { stats, isLoading, error } = useAppSelector((state) => state.activity);
  const { open } = useDrill();

  const context = useOutletContext<ActivityContext | undefined>();
  const query = context?.query ?? '';

  useEffect(() => {
    dispatch(fetchActivityStats(query));
  }, [dispatch, query]);

  const kpis = stats?.kpis;
  const currency = stats?.currency ?? 'USD';
  const windowDays = stats?.window_days ?? 90;
  const threshold = stats?.going_dark_threshold ?? 60;

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

      <div
        className={`w-full flex flex-col gap-4 transition-opacity ${
          isLoading && stats ? 'opacity-60' : ''
        }`}
      >
        <KpiStrip>
          <Kpi
            label="Touches logged"
            value={kpis ? kpis.touches.toLocaleString() : '—'}
            detail={
              kpis
                ? `${kpis.inbound.toLocaleString()} inbound tickets in the same ${windowDays} days`
                : 'loading'
            }
          />
          <Kpi
            label="Coverage"
            value={kpis?.coverage === null || kpis === undefined ? '—' : `${kpis.coverage}%`}
            detail={
              kpis
                ? `${kpis.touched_accounts} of ${kpis.accounts} accounts contacted`
                : 'loading'
            }
          />
          <Kpi
            label="Gone quiet"
            value={kpis ? String(kpis.dark_accounts) : '—'}
            detail={
              kpis
                ? kpis.dark_accounts > 0
                  ? `${formatCompactMoney(kpis.dark_arr, currency)} with no contact in ${threshold} days`
                  : `everything contacted inside ${threshold} days`
                : 'loading'
            }
            tone={kpis && kpis.dark_accounts > 0 ? 'loss' : 'neutral'}
            onDrill={
              kpis && !isLoading
                ? (trigger) =>
                    open(
                      {
                        title: 'Gone quiet',
                        figure: String(kpis.dark_accounts),
                        source: { kind: 'server', path: '/customers/activity/', query, segment: 'gone_quiet' },
                      },
                      trigger,
                    )
                : undefined
            }
          />
          <Kpi
            label="Overdue tasks"
            value={kpis ? String(kpis.overdue_tasks) : '—'}
            detail={
              kpis
                ? `of ${kpis.open_tasks} open · ${kpis.completed_tasks} completed`
                : 'loading'
            }
            tone={kpis && kpis.overdue_tasks > 0 ? 'loss' : 'neutral'}
          />
        </KpiStrip>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 [&>*]:min-w-0">
          <div className="xl:col-span-2 bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
            <TouchTimeline
              weeks={stats?.timeline ?? []}
              sources={stats?.sources ?? []}
              inbound={kpis?.inbound ?? 0}
              windowDays={windowDays}
            />
          </div>
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden h-[360px]">
            <CadenceChart
              buckets={stats?.cadence ?? []}
              currency={currency}
              threshold={threshold}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 [&>*]:min-w-0">
          <div className="xl:col-span-2 bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden">
            <GoingDarkTable
              rows={stats?.going_dark ?? []}
              currency={currency}
              threshold={threshold}
            />
          </div>
          <div className="bg-surface border border-line-subtle rounded-lg shadow-sm overflow-hidden max-h-[420px]">
            <OwnerCoverageList
              owners={stats?.by_owner ?? []}
              currency={currency}
              windowDays={windowDays}
              threshold={threshold}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

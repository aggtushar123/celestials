import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { fetchTicketStats } from '../../../../features/tickets/ticketsSlice';
import { KPIGrid } from './charts/KPIGrid';
import { PriorityDonut } from './charts/PriorityDonut';
import { StatusDonut } from './charts/StatusDonut';
import { OriginBar } from './charts/OriginBar';
import { AssigneesStackedBar } from './charts/AssigneesStackedBar';
import { SentimentLineChart } from './charts/SentimentLineChart';

/** The filter query string, handed down by TicketOverviewContainer's
 * own filter bar. Empty means unfiltered. */
export interface TicketOverviewContext {
  query: string;
}

export function ControlsView() {
  const dispatch = useAppDispatch();
  const { stats, statsLoading, statsError } = useAppSelector((state) => state.tickets);

  // `useOutletContext` is optional-safe here so the view still renders
  // if it's ever mounted outside the container (a test, or a future
  // route).
  const context = useOutletContext<TicketOverviewContext | undefined>();
  const query = context?.query ?? '';

  useEffect(() => {
    dispatch(fetchTicketStats(query));
  }, [dispatch, query]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {statsError && (
        <p className="text-[12.5px] font-semibold text-danger" role="alert">
          {statsError}
        </p>
      )}

      {/* Dimmed rather than replaced while a refetch runs: changing a
          filter shouldn't blank the dashboard and reflow it, and the
          numbers on screen are still the last true ones. */}
      <div
        className={`flex flex-col gap-6 w-full transition-opacity ${
          statsLoading && stats ? 'opacity-60' : ''
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 [&>*]:min-w-0">
          <div className="lg:col-span-1">
            <KPIGrid kpis={stats?.kpis ?? null} query={query} drillable={!statsLoading} />
          </div>

          <div className="bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden flex flex-col">
            <PriorityDonut data={stats?.priority ?? []} query={query} drillable={!statsLoading} />
          </div>

          <div className="bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden flex flex-col">
            <StatusDonut data={stats?.status ?? []} query={query} drillable={!statsLoading} />
          </div>

          <div className="w-full">
            <OriginBar data={stats?.origin ?? []} query={query} drillable={!statsLoading} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>*]:min-w-0">
          <div className="bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden flex flex-col">
            <AssigneesStackedBar data={stats?.assignees ?? []} query={query} drillable={!statsLoading} />
          </div>

          <div className="bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden flex flex-col">
            <SentimentLineChart data={stats?.sentiment_timeline ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}

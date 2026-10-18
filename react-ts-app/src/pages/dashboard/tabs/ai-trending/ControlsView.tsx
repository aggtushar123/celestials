import { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../hooks';
import { fetchInteractionStats } from '../../../../features/interactions/interactionsSlice';
import { ActivityTypeDonut } from './charts/ActivityTypeDonut';
import { ActivitySentimentDonut } from './charts/ActivitySentimentDonut';
import { ActivityDetailedTable } from './charts/ActivityDetailedTable';
import { SentimentOverTimeLine } from './charts/SentimentOverTimeLine';
import { ActivitiesByAIAreaDonut } from './charts/ActivitiesByAIAreaDonut';
import { ActivitiesByAICategoryBar } from './charts/ActivitiesByAICategoryBar';
import { ActivitiesByAISubCategoryBar } from './charts/ActivitiesByAISubCategoryBar';

/** The filter query string, handed down by AITrendingTopics' own filter bar.
 *  Empty means unfiltered. */
export interface AITrendingContext {
  query: string;
}

export function ControlsView() {
  const dispatch = useAppDispatch();
  const { stats, isLoading, error } = useAppSelector((state) => state.interactions);

  // Optional-safe so the view still renders if it's ever mounted outside the
  // container — a test, or a future route. Same shape as the Ticket Overview's.
  const context = useOutletContext<AITrendingContext | undefined>();
  const query = context?.query ?? '';

  useEffect(() => {
    dispatch(fetchInteractionStats(query));
  }, [dispatch, query]);

  const total = stats?.total ?? 0;
  const classified = stats?.classified ?? 0;

  return (
    <div className="w-full h-full flex flex-col gap-4 pb-12">
      {error && (
        <p className="text-[12.5px] font-semibold text-danger" role="alert">
          {error}
        </p>
      )}

      {stats && stats.total === 0 && !isLoading && (
        <p className="text-[12.5px] text-ink-faint">
          No emails, calls or tickets match these filters.
        </p>
      )}

      {/* Dimmed rather than replaced while a refetch runs: changing a filter
          shouldn't blank the dashboard and reflow it, and the numbers on screen
          are still the last true ones. */}
      <div
        className={`w-full h-full flex flex-col gap-4 transition-opacity ${
          isLoading && stats ? 'opacity-60' : ''
        }`}
      >
        {/* Top Row: Type Donut (1/3) + Detailed Table (2/3) */}
        {/* Below xl the two stack (UI broken-things fix 19): the row grows to
            fit them, and the table keeps room for its rows instead of being
            squeezed to its header by the donut above it. */}
        <div className="flex flex-col xl:flex-row gap-4 xl:h-full min-h-[500px] shrink-0 xl:shrink [&>*]:min-w-0">
          <div className="xl:w-[32%] bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden shrink-0">
            <ActivityTypeDonut data={stats?.by_type ?? []} query={query} drillable={!isLoading} />
          </div>
          <div className="xl:flex-1 min-h-[420px] shrink-0 xl:shrink bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden flex flex-col">
            <ActivityDetailedTable rows={stats?.recent ?? []} />
          </div>
        </div>

        {/* Bottom Row: Sentiment Donut (1/3) + Sentiment Line Chart (2/3) */}
        <div className="flex flex-col xl:flex-row gap-4 h-full min-h-[380px] [&>*]:min-w-0">
          <div className="xl:w-[32%] bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden shrink-0">
            <ActivitySentimentDonut data={stats?.sentiment ?? []} query={query} drillable={!isLoading} />
          </div>
          <div className="xl:flex-1 bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden flex flex-col">
            <SentimentOverTimeLine data={stats?.sentiment_timeline ?? []} />
          </div>
        </div>

        {/* Third Row: the AI taxonomy — area, category, subcategory. These three
            count only classified interactions, which is why each carries the
            total as well as its own rows. */}
        <div className="flex flex-col xl:flex-row gap-4 h-full min-h-[380px] [&>*]:min-w-0">
          <div className="xl:flex-1 bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden border-t-4 border-t-accent">
            <ActivitiesByAIAreaDonut
              data={stats?.areas ?? []}
              classified={classified}
              total={total}
              query={query}
              drillable={!isLoading}
            />
          </div>
          <div className="xl:flex-1 bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden border-t-4 border-t-accent">
            <ActivitiesByAICategoryBar
              data={stats?.categories ?? []}
              classified={classified}
              total={total}
              query={query}
              drillable={!isLoading}
            />
          </div>
          <div className="xl:flex-1 bg-surface border border-line-subtle shadow-sm rounded-lg overflow-hidden border-t-4 border-t-accent">
            <ActivitiesByAISubCategoryBar
              data={stats?.subcategories ?? []}
              classified={classified}
              total={total}
              query={query}
              drillable={!isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

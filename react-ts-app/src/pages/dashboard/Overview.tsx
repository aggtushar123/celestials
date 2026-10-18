import { useEffect, useState } from 'react';
import { fetchAttention } from '../../features/attention/attentionApi';
import type { AttentionResponse } from '../../features/attention/attentionApi';
import { DashboardToolbar } from './shared/DashboardToolbar';
import { bookFilters } from './shared/bookFilters';
import { SHARED_KEYS, toQuery, useDashboardFilters } from './shared/useDashboardFilters';
import { AttentionList } from './overview/AttentionList';
import { HeadlineCards } from './overview/HeadlineCards';

interface AttentionState {
  status: 'loading' | 'error' | 'done';
  /** The last good response; kept through a refetch or a failed one. */
  data: AttentionResponse | null;
  /** The query `status` describes. */
  query: string;
}

/**
 * The dashboard's landing page: what needs you, ranked, beside a headline
 * from each area. Filtered by the same three book filters as the areas.
 */
export function Overview() {
  const { values } = useDashboardFilters(SHARED_KEYS);
  const query = toQuery(values);
  const [state, setState] = useState<AttentionState>({ status: 'loading', data: null, query });

  // A new query is loading from the render that asks it, with the last list
  // still on screen. Adjusted during render (as DrillContext does) rather
  // than in the effect, so no frame shows the old status for the new query.
  if (state.query !== query) setState({ ...state, status: 'loading', query });

  useEffect(() => {
    // A later filter change supersedes this request; its answer is dropped.
    let current = true;
    fetchAttention(query).then(
      (data) => current && setState({ status: 'done', data, query }),
      () => current && setState((prev) => ({ ...prev, status: 'error' })),
    );
    return () => {
      current = false;
    };
  }, [query]);

  const { status, data } = state;
  return (
    <div className="w-full pb-12">
      <DashboardToolbar subViews={[]} filters={bookFilters(data?.filters)} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start">
        <div className={`min-w-0 transition-opacity duration-[var(--dur-fast)] ${status === 'loading' && data ? 'opacity-60' : ''}`}>
          {/* Keyed by the query: a snooze and its Undo belong to the list it
              was made on, so another filter starts clean. The rows shown
              while a refetch runs come from here, not the list, so they
              survive the remount. */}
          <AttentionList
            key={query}
            items={data?.items ?? null}
            currency={data?.currency ?? 'USD'}
            loading={status === 'loading'}
            error={status === 'error'}
          />
        </div>
        <HeadlineCards values={values} />
      </div>
    </div>
  );
}

import { useRef } from 'react';
import { fetchPlansPaged } from '../../features/plans/planApi';
import { PLAN_NOUN } from '../../features/plans/planOptions';
import type { PlanRow, PlansPage } from '../../features/plans/planTypes';
import { MoreButton } from '../organizations/portfolio/PortfolioSections';
import { usePagedRead } from '../organizations/portfolio/usePagedRead';
import { BUTTON, EmptyState, ErrorState, ListCard, ListHeaderRow, LoadingState } from '../ui';
import { PlanRowItem } from './PlanRowItem';
import { PLAN_GRID } from './planGrid';

const EXPLAINER = 'A plan sets out the work on one customer over weeks: milestones, and the tasks under them.';

/** The List (spec §2.1): one row per plan, Show more on the cursor, and its
 *  empty, loading and error states. While a new query loads the last rows
 *  stay, marked busy. */
export function PlansList({ query, filtered, onClear }: { query: string; filtered: boolean; onClear: () => void }) {
  const read = usePagedRead<PlanRow, PlansPage & { next_cursor: string | null }>(fetchPlansPaged, PLAN_NOUN, query, true, 0);
  const listRef = useRef<HTMLUListElement>(null);
  const state =
    read.error && read.rows.length === 0 ? (
      <ErrorState message={read.error} onRetry={read.retry} />
    ) : read.loading && read.rows.length === 0 ? (
      <LoadingState label="Loading plans" count={5} />
    ) : read.rows.length === 0 ? (
      filtered ? (
        <EmptyState
          title="No plans match these filters"
          detail="Remove a filter, or clear them all."
          action={
            <button type="button" onClick={onClear} className={BUTTON}>
              Clear filters
            </button>
          }
        />
      ) : (
        <EmptyState title="No plans yet" detail={EXPLAINER} />
      )
    ) : undefined;
  return (
    <div className="flex flex-col gap-2">
      {read.error && read.rows.length > 0 ? (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] leading-5 text-danger-ink">{read.error} Showing the last result.</p>
          <button type="button" onClick={read.retry} className={BUTTON}>
            Try again
          </button>
        </div>
      ) : null}
      <div className="@container">
        <ListCard
          label="Plans"
          busy={read.loading}
          state={state}
          header={state ? undefined : <ListHeaderRow columns={PLAN_GRID.columns} labels={PLAN_GRID.labels} align={PLAN_GRID.aligns} show={PLAN_GRID.headerShow} />}
          listRef={listRef}
          footer={
            read.next ? <MoreButton next={read.next} loading={read.loadingMore} error={read.moreError} label="Show more" onClick={() => void read.loadMore()} list={listRef} /> : undefined
          }
        >
          {read.rows.map((row) => (
            <PlanRowItem key={row.id} row={row} />
          ))}
        </ListCard>
      </div>
    </div>
  );
}

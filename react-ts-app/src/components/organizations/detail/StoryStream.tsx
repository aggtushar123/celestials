import { dayLabel, groupByDay, localDay } from '../../../features/organizations/storyDays';
import type { StoryItem } from '../../../features/organizations/storyTypes';
import { MoreButton } from '../portfolio/PortfolioSections';
import { useEndSentinel } from '../portfolio/useEndSentinel';
import { BUTTON, CardHeader, EmptyState as UiEmptyState, ErrorState as UiErrorState, ListCard, LoadingState } from '../../ui';
import { StoryItemRow } from './StoryItemRow';
import type { StoryState } from './useStory';

function Day({
  label,
  items,
  onOpenEmail,
  onOpenSlack,
}: {
  label: string;
  items: StoryItem[];
  onOpenEmail: (item: StoryItem) => void;
  onOpenSlack: (item: StoryItem) => void;
}) {
  return (
    <ListCard label={label} header={<CardHeader title={label} level={2} />}>
      {items.map((item) => (
        <StoryItemRow key={`${item.kind}:${item.id}`} item={item} onOpenEmail={onOpenEmail} onOpenSlack={onOpenSlack} />
      ))}
    </ListCard>
  );
}

/** The stream (spec §1.6): a clean list grouped by day, newest first, in the
 *  Communications inbox's manner. The next page loads when the end scrolls
 *  into view, with Show more as the fallback. */
export function StoryStream({
  story,
  filtered,
  today = localDay(new Date()),
  onClearFilters,
  onOpenEmail,
  onOpenSlack,
}: {
  story: StoryState;
  /** Any account, filter, source or search is set (the empty state offers Clear filters). */
  filtered: boolean;
  today?: string;
  onClearFilters: () => void;
  onOpenEmail: (item: StoryItem) => void;
  onOpenSlack: (item: StoryItem) => void;
}) {
  const sentinel = useEndSentinel(() => void story.loadMore(), Boolean(story.next) && !story.loadingMore && !story.moreError);

  if (story.error) return <ListCard label="The story" state={<UiErrorState message={story.error} onRetry={story.retry} />} />;
  if (!story.data) return <ListCard label="The story" state={<LoadingState label="Loading the story" count={5} />} />;
  if (story.items.length === 0) {
    return (
      <ListCard
        label="The story"
        state={
          filtered ? (
            <UiEmptyState
              title="Nothing matches these filters"
              detail="Try another account, filter or search."
              action={
                <button type="button" onClick={onClearFilters} className={BUTTON}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <UiEmptyState title="Nothing here yet" detail="Calls, emails, tickets, tasks and notes appear here as they happen." />
          )
        }
      />
    );
  }

  return (
    <div aria-busy={story.loading} className="flex flex-col gap-4">
      {groupByDay(story.items).map((day) => (
        <Day key={day.key} label={dayLabel(day.key, today)} items={day.items} onOpenEmail={onOpenEmail} onOpenSlack={onOpenSlack} />
      ))}
      <div ref={sentinel} data-sentinel="" aria-hidden="true" className="h-px" />
      <MoreButton next={story.next} loading={story.loadingMore} error={story.moreError} label="Show more" onClick={() => void story.loadMore()} className="mt-1.5" />
    </div>
  );
}

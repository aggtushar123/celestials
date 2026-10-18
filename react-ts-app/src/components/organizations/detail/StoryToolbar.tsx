import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { ADD_FLOWS, STORY_GROUPS, offeredSources, type AddKind } from '../../../features/organizations/storyKinds';
import type { StoryCounts, StoryGroup, StoryKind } from '../../../features/organizations/storyTypes';
import { FilterChipRow, PRIMARY, SearchInput, Toolbar } from '../../ui';
import { CountChip } from './CountChip';
import { Menu } from '../../ui';
import { SourcesPicker } from './SourcesPicker';

const SEARCH_DELAY_MS = 300;

/** The story's toolbar (spec §1.6): the six filters with their counts,
 *  Sources, search and + Add. */
export function StoryToolbar({
  group,
  sources,
  q,
  byGroup,
  byKind,
  onGroup,
  onSources,
  onSearch,
  onAdd,
  addKinds,
}: {
  group: StoryGroup | '';
  sources: StoryKind[];
  q: string;
  /** `counts.by_group` from the story (`all` and the five groups); null until it lands. */
  byGroup: StoryCounts['by_group'] | null;
  /** `counts.by_kind` from the story; null until it lands. */
  byKind: StoryCounts['by_kind'] | null;
  onGroup: (group: StoryGroup | '') => void;
  onSources: (sources: StoryKind[]) => void;
  onSearch: (q: string) => void;
  onAdd: (what: AddKind) => void;
  /** The create flows offered; default every one. */
  addKinds?: readonly AddKind[];
}) {
  const [draft, setDraft] = useState(q);
  // The URL's q changed from outside (Clear filters, Back): the box follows.
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setDraft(q);
  }

  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    if (draft.trim() === q.trim()) return;
    const timer = window.setTimeout(() => onSearchRef.current(draft.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, q]);

  const total = byGroup ? byGroup.all : null;

  const search = (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearchRef.current(draft.trim());
      }}
      className="min-w-0 flex-1 sm:max-w-sm"
    >
      <SearchInput label="Search the story" placeholder="Search the story" value={draft} onChange={setDraft} width="full" />
    </form>
  );
  const menu = (
    <Menu
      label="Add to the story"
      trigger={
        <>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </>
      }
      triggerClassName={PRIMARY}
      items={ADD_FLOWS.filter((flow) => !addKinds || addKinds.includes(flow.key)).map((flow) => ({ key: flow.key, label: flow.label, onSelect: () => onAdd(flow.key) }))}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <FilterChipRow label="Show">
        {STORY_GROUPS.map((option) => (
          <CountChip
            key={option.key || 'all'}
            label={option.label}
            count={option.key ? (byGroup?.[option.key] ?? null) : total}
            pressed={group === option.key}
            onClick={() => onGroup(option.key)}
          />
        ))}
      </FilterChipRow>
      <Toolbar
        search={search}
        filters={<SourcesPicker offered={offeredSources(group, byKind, sources)} selected={sources} onChange={onSources} />}
        actions={{ primary: menu }}
      />
    </div>
  );
}

import { useCallback, useRef, useState, type RefObject } from 'react';
import { pipelineChips } from '../../../features/pipelines/pipelineChips';
import type { PipelineKind } from '../../../features/pipelines/pipelineKinds';
import type { PipelineParams, PipelineView } from '../../../features/pipelines/pipelineParams';
import type { PipelineFilterOptions } from '../../../features/pipelines/pipelineTypes';
import { Plus } from 'lucide-react';
import { PRIMARY, SearchInput, Toolbar, type UiAction } from '../../ui';
import { FiltersTrigger, SelectToggle } from '../../organizations/portfolio/toolbarParts';
import { useSearchText } from '../../organizations/portfolio/useSearchText';
import { PipelineFilters, PipelineGroupSort } from './PipelineFilters';
import { PipelineKindSwitch } from './PipelineKindSwitch';

const LABEL = 'Search by title, organization or account';

/** The one toolbar (UI foundations spec §5.6): Opportunities | Risks first,
 *  the search with its count, group and sort from sm, Filters (with its count
 *  of active filters), then Export and Add from sm. Below sm the Filters sheet
 *  holds group, sort, Export and Add. The Select toggle sits beside Filters
 *  at every width: it is the one way to show the checkboxes. */
export function PipelineToolbar({
  kind,
  view,
  params,
  update,
  options,
  isSm,
  onExport,
  exporting,
  onAdd,
  searchRef,
  selectMode = false,
  onToggleSelectMode,
  count,
}: {
  kind: PipelineKind;
  view: PipelineView;
  params: PipelineParams;
  update: (patch: Partial<PipelineParams>) => void;
  options: PipelineFilterOptions | null;
  isSm: boolean;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Selection mode is on (checkboxes show). The List only. */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  /** "14 opportunities", announced beside the search. */
  count: string;
}) {
  const commitSearch = useCallback((search: string) => update({ search }), [update]);
  const [text, setText] = useSearchText(params.search, commitSearch);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = pipelineChips(params, null, kind).length;

  const secondary: UiAction[] = isSm
    ? [
        {
          key: 'export',
          label: exporting ? 'Exporting…' : 'Export',
          onSelect: () => {
            if (!exporting) onExport();
          },
        },
      ]
    : [];

  return (
    <div className="relative">
      <Toolbar
        lead={<PipelineKindSwitch />}
        search={<SearchInput label={LABEL} placeholder="Search pipelines" value={text} onChange={setText} inputRef={searchRef} />}
        count={count}
        filters={
          <>
            {isSm ? <PipelineGroupSort kind={kind} view={view} params={params} update={update} /> : null}
            <FiltersTrigger triggerRef={triggerRef} open={open} onClick={() => setOpen((was) => !was)} count={active} />
            {onToggleSelectMode ? <SelectToggle pressed={selectMode} onClick={onToggleSelectMode} /> : null}
          </>
        }
        actions={{
          secondary,
          primary: isSm ? (
            <button type="button" onClick={onAdd} className={PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {`Add ${kind.noun.one}`}
            </button>
          ) : undefined,
        }}
      />
      {open ? (
        <PipelineFilters
          kind={kind}
          view={view}
          params={params}
          update={update}
          options={options}
          isSm={isSm}
          onClose={close}
          onExport={() => {
            close();
            onExport();
          }}
          exporting={exporting}
          onAdd={() => {
            close();
            onAdd();
          }}
          triggerRef={triggerRef}
        />
      ) : null}
    </div>
  );
}

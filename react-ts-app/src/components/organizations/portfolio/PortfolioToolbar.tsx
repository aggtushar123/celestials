import { useCallback, useRef, useState, type RefObject } from 'react';
import { Pin, Plus } from 'lucide-react';
import type { ColumnId } from '../tableData';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { FiltersPanel, GroupSortControls, type GroupOption } from './FiltersPanel';
import { PinFieldsMenu } from './PinFieldsMenu';
import { usePortfolioKind } from './portfolioKind';
import { BUTTON, PRIMARY, SearchInput, Toolbar, type UiAction } from '../../ui';
import { FiltersTrigger, SelectToggle } from './toolbarParts';
import { useSearchText } from './useSearchText';

const LABEL = 'Search by name or Revenact ID';

function activeFilters(p: PortfolioParams): number {
  return (
    [p.owner !== '', p.renews_within !== '', p.nps !== '', p.include_churned, p.ids.length > 0].filter(Boolean).length +
    p.lifecycle.length +
    p.health.length +
    p.product.length +
    (p.organisation?.length ?? 0)
  );
}

export function PortfolioToolbar({
  params,
  update,
  options,
  isSm,
  pins = [],
  onTogglePin,
  onExport,
  exporting,
  onAdd,
  searchRef,
  selectMode = false,
  onToggleSelectMode,
  groupOptions,
  onSaveAsSegment,
  count,
}: {
  params: PortfolioParams;
  update: (patch: Partial<PortfolioParams>) => void;
  options: FilterOptions | null;
  isSm: boolean;
  /** Omitted on the Board, whose cards show no pinned chips: no Pin fields then. */
  pins?: ColumnId[];
  onTogglePin?: (id: ColumnId) => void;
  onExport: () => void;
  exporting: boolean;
  onAdd: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Phones: selection mode is on (checkboxes show without a long press). */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  /** The Group choices; the Board passes BOARD_GROUP_OPTIONS (no "None"). */
  groupOptions?: GroupOption[];
  /** The List's "Save as segment" (segments spec §3): beside Filters. The
   *  Board passes none. */
  onSaveAsSegment?: () => void;
  /** "14 organizations", announced beside the search. */
  count: string;
}) {
  const kind = usePortfolioKind();
  // The box shows what is typed; the URL gets it 300ms after typing stops.
  const commitSearch = useCallback((search: string) => update({ search }), [update]);
  const [text, setText] = useSearchText(params.search, commitSearch);

  const [open, setOpen] = useState<'filters' | 'pins' | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const active = activeFilters(params);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const pinsTriggerRef = useRef<HTMLButtonElement>(null);

  const secondary: UiAction[] = [
    ...(onSaveAsSegment ? [{ key: 'segment', label: 'Save as segment', onSelect: onSaveAsSegment }] : []),
    // Below sm, Export and Add live in the Filters sheet's footer.
    ...(isSm
      ? [
          {
            key: 'export',
            label: exporting ? 'Exporting…' : 'Export',
            onSelect: () => {
              if (!exporting) onExport();
            },
          },
        ]
      : []),
  ];

  return (
    <div className="relative">
      <Toolbar
        search={<SearchInput label={LABEL} placeholder="Search by name or ID" value={text} onChange={setText} inputRef={searchRef} />}
        count={count}
        filters={
          <>
            {isSm ? <GroupSortControls params={params} update={update} groupOptions={groupOptions} /> : null}
            <FiltersTrigger triggerRef={filtersTriggerRef} open={open === 'filters'} onClick={() => setOpen(open === 'filters' ? null : 'filters')} count={active} />
            {!isSm && onToggleSelectMode ? <SelectToggle pressed={selectMode} onClick={onToggleSelectMode} /> : null}
          </>
        }
        actions={{
          extra:
            isSm && onTogglePin ? (
              <button ref={pinsTriggerRef} type="button" aria-expanded={open === 'pins'} aria-haspopup="dialog" onClick={() => setOpen(open === 'pins' ? null : 'pins')} className={BUTTON}>
                <Pin className="h-4 w-4" aria-hidden="true" />
                Pin fields
              </button>
            ) : undefined,
          secondary,
          primary: isSm ? (
            <button type="button" onClick={onAdd} className={PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {`Add ${kind.noun.one}`}
            </button>
          ) : undefined,
        }}
      />
      {open === 'filters' ? (
        <FiltersPanel
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
          triggerRef={filtersTriggerRef}
          groupOptions={groupOptions}
        />
      ) : null}
      {open === 'pins' && onTogglePin ? (
        <PinFieldsMenu pins={pins} onToggle={onTogglePin} onClose={close} triggerRef={pinsTriggerRef} />
      ) : null}
    </div>
  );
}

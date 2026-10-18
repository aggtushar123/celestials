import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Download, Filter } from 'lucide-react';
import { AttributesTable } from './AttributesTable';
import { ATTRIBUTE_TYPE_LABELS, type AttributeDef } from './attributeConfig';
import {
  NO_ATTRIBUTE_FILTERS,
  activeFilterCount,
  applyAttributeFilters,
  attributesCsv,
  type AttributeFilters,
  type UsageFilter,
} from './attributeFilters';
import { downloadCsv } from '../../lib/csv';
import { BUTTON, CHECKBOX, CHOICE, Card, EmptyState, ErrorState, ICON_BUTTON, LoadingState, NUM, OVERLAY, QUIET, SearchInput, TYPE, Toolbar } from '../../components/ui';

export interface AttributesTabContentProps<T> {
  /** Lowercase noun used in the search label: "organization", "account",
   * "opportunity". Also names the CSV download. */
  entityLabel: string;
  /** Lowercase plural, for the loading text. Defaults to
   * `${entityLabel}s`, which is wrong for "opportunity" (not
   * "opportunitys"), so that one passes "opportunities" explicitly. */
  pluralLabel?: string;
  /** The toolbar's lead: Pipeline's Opportunities / Risks switch. */
  lead?: ReactNode;
  /** Already filtered by `searchQuery`: see SettingsPage's own
   * per-entity useMemo. */
  attributes: AttributeDef<T>[];
  /** Unfiltered: the search placeholder's total count, and the attribute
   * types the Filter offers. */
  allAttributes: AttributeDef<T>[];
  entities: T[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}

const USAGE_OPTIONS: { key: UsageFilter; label: string }[] = [
  { key: 'filled', label: 'Has values' },
  { key: 'empty', label: 'Empty' },
];

function toggled<K>(list: K[], key: K): K[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key];
}

// Shared toolbar and AttributesTable for every entity's own tab (Organization,
// Account, Contact, Pipeline), so SettingsPage doesn't carry one copy per
// entity. Filter and Download work on the rows on screen (settings spec
// 2026-10-06 §3.3); SettingsPage keys each entity's copy, so the filters
// reset when the tab changes.
export function AttributesTabContent<T>({
  entityLabel,
  pluralLabel = `${entityLabel}s`,
  lead,
  attributes,
  allAttributes,
  entities,
  isLoading,
  error,
  searchQuery,
  setSearchQuery,
}: AttributesTabContentProps<T>) {
  const [filters, setFilters] = useState<AttributeFilters>(NO_ATTRIBUTE_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  const typesPresent = useMemo(() => [...new Set(allAttributes.map((attr) => attr.type))], [allAttributes]);
  const visible = useMemo(() => applyAttributeFilters(attributes, entities, filters), [attributes, entities, filters]);
  const active = activeFilterCount(filters);

  // The popover closes on a click outside it and on Escape; only Escape hands
  // focus back to the Filter button (a click has already put it elsewhere).
  useEffect(() => {
    if (!isFilterOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setIsFilterOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsFilterOpen(false);
      filterButtonRef.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isFilterOpen]);

  const query = searchQuery.trim();
  const filterControl = (
    <div ref={filterRef} className="relative">
      <button
        ref={filterButtonRef}
        type="button"
        aria-label={active > 0 ? `Filter attributes, ${active} active` : 'Filter attributes'}
        aria-expanded={isFilterOpen}
        onClick={() => setIsFilterOpen((open) => !open)}
        className={BUTTON}
      >
        <Filter className="h-4 w-4" aria-hidden="true" />
        Filter
        {active > 0 ? <span className={NUM}>{active}</span> : null}
      </button>
      {isFilterOpen ? (
        <div role="group" aria-label="Attribute filters" className={`absolute right-0 top-full z-20 mt-1 flex w-56 flex-col gap-3 p-3 ${OVERLAY}`}>
          <fieldset className="flex flex-col">
            <legend className={`mb-1 ${TYPE.label}`}>Type</legend>
            {typesPresent.map((type) => (
              <label key={type} className={CHOICE}>
                <input type="checkbox" checked={filters.types.includes(type)} onChange={() => setFilters((current) => ({ ...current, types: toggled(current.types, type) }))} className={CHECKBOX} />
                {ATTRIBUTE_TYPE_LABELS[type]}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col">
            <legend className={`mb-1 ${TYPE.label}`}>Usage</legend>
            {USAGE_OPTIONS.map((option) => (
              <label key={option.key} className={CHOICE}>
                <input type="checkbox" checked={filters.usage.includes(option.key)} onChange={() => setFilters((current) => ({ ...current, usage: toggled(current.usage, option.key) }))} className={CHECKBOX} />
                {option.label}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            aria-disabled={active === 0 || undefined}
            onClick={() => {
              // aria-disabled keeps focus here once it has cleared, so a press with nothing to clear returns early.
              if (active === 0) return;
              setFilters(NO_ATTRIBUTE_FILTERS);
            }}
            className={QUIET}
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );

  let body: ReactNode;
  if (isLoading && entities.length === 0)
    body = (
      <Card pad="none">
        <LoadingState label={`Loading ${pluralLabel}`} />
      </Card>
    );
  else if (error)
    body = (
      <Card pad="none">
        <ErrorState message={error} />
      </Card>
    );
  else if (active > 0 && visible.length === 0)
    body = (
      <Card pad="none">
        <EmptyState
          title="No attributes match these filters"
          action={
            <button type="button" onClick={() => setFilters(NO_ATTRIBUTE_FILTERS)} className={QUIET}>
              Clear filters
            </button>
          }
        />
      </Card>
    );
  else if (query && visible.length === 0)
    body = (
      <Card pad="none">
        <EmptyState
          title={`No attributes match “${query}”`}
          action={
            <button type="button" onClick={() => setSearchQuery('')} className={QUIET}>
              Clear search for “{query}”
            </button>
          }
        />
      </Card>
    );
  else body = <AttributesTable entities={entities} attributes={visible} />;

  return (
    <>
      <Toolbar
        lead={lead}
        search={<SearchInput label={`Search ${allAttributes.length} ${entityLabel} attributes`} placeholder="Search attributes" value={searchQuery} onChange={setSearchQuery} />}
        count={`${visible.length} ${visible.length === 1 ? 'attribute' : 'attributes'}`}
        actions={{
          extra: (
            <>
              {filterControl}
              <button type="button" aria-label="Download attributes as CSV" onClick={() => downloadCsv(`${entityLabel}-attributes.csv`, attributesCsv(visible, entities))} className={`${ICON_BUTTON} border border-line bg-surface`}>
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ),
        }}
      />
      {body}
    </>
  );
}

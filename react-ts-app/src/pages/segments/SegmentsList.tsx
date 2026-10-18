import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchSegments } from '../../features/segments/segmentApi';
import { parseListParams, SCOPES, toListSearch, type ListParams } from '../../features/segments/segmentParams';
import type { SegmentListRow } from '../../features/segments/segmentTypes';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useSearchText } from '../../components/organizations/portfolio/useSearchText';
import { SegmentRow } from '../../components/segments/SegmentRow';
import { SEGMENT_GRID } from '../../components/segments/segmentGrid';
import { BUTTON, EmptyState, ErrorState, ListCard, ListHeaderRow, LoadingState, PageHeader, PRIMARY, SearchInput, SegmentedControl, Toolbar } from '../../components/ui';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** The latest answer, for `key`. A failure keeps the last list (`rows`) so
 *  the page can go on showing it beside the error. */
type Answer = { key: string; rows: SegmentListRow[] | null; error: string | null };

/** /segments (spec §3): one toolbar (Show: All, Mine or Shared with me; the search and its count; New segment), then one card of rows. Scope and search live in the URL. */
export function SegmentsList() {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseListParams(search), [search]);
  const update = useCallback((patch: Partial<ListParams>) => setSearch(toListSearch({ ...params, ...patch }), { replace: true }), [params, setSearch]);
  const commitSearch = useCallback((text: string) => update({ search: text }), [update]);
  const [text, setText] = useSearchText(params.search, commitSearch);
  const searchRef = useRef<HTMLInputElement>(null);

  const [attempt, setAttempt] = useState(0);
  const key = `${params.scope}#${params.search}#${attempt}`;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSegments(params.scope, params.search).then(
      (rows) => {
        if (alive) setAnswer({ key, rows, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer((last) => ({ key, rows: last?.rows ?? null, error: errorMessage(err, 'Could not load segments.') }));
      },
    );
    return () => {
      alive = false;
    };
  }, [key, params.scope, params.search]);

  // The last list stays while a new scope or search loads.
  const rows = answer?.rows ?? null;
  const error = answer?.key === key ? answer.error : null;
  const loading = answer?.key !== key;

  const retry = () => setAttempt((n) => n + 1);
  // With no list worth keeping, the failure takes the card: an empty last
  // answer would otherwise read as "none" for a scope that never loaded.
  const state =
    error && (!rows || rows.length === 0) ? (
      <ErrorState message={error} onRetry={retry} />
    ) : !rows || (loading && rows.length === 0) ? (
      // An empty answer for the last scope or search says nothing about the next.
      <LoadingState label="Loading segments" count={4} />
    ) : rows.length === 0 && params.search ? (
      <EmptyState
        title={`No segments match "${params.search}"`}
        detail="Try another name, or clear the search."
        action={
          <button
            type="button"
            aria-label={`Clear search for “${params.search}”`}
            onClick={() => update({ search: '' })}
            className={BUTTON}
          >
            Clear search
          </button>
        }
      />
    ) : rows.length === 0 && params.scope === 'shared' ? (
      <EmptyState title="Nothing is shared with you yet" detail="When a teammate shares a segment with you or the workspace, it shows here." />
    ) : rows.length === 0 ? (
      <EmptyState
        title="No segments yet"
        detail="A segment is a saved group of organisations, accounts or contacts that match your rules. It updates itself as they change, and can tell you each day who entered and who left."
        action={
          <Link to="/organizations/list" className={BUTTON}>
            Filter Organizations, then Save as segment
          </Link>
        }
      />
    ) : undefined;
  const count = rows && !loading ? `${rows.length} ${rows.length === 1 ? 'segment' : 'segments'}` : '';

  return (
    <OrganizationsFrame>
      <PageHeader title="Segments" />
      <div className="flex flex-col gap-4 pb-6">
        <Toolbar
          lead={<SegmentedControl label="Show" options={SCOPES} value={params.scope} onChange={(scope) => update({ scope })} />}
          search={<SearchInput label="Search segments by name" placeholder="Search segments" value={text} onChange={setText} inputRef={searchRef} />}
          count={count}
          actions={{
            primary: (
              <Link to="/segments/new" className={PRIMARY}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New segment
              </Link>
            ),
          }}
        />
        {error && rows && rows.length > 0 ? (
          <div role="alert" className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] leading-5 text-danger-ink">{error} Showing the last result.</p>
            <button type="button" onClick={retry} className={BUTTON}>
              Try again
            </button>
          </div>
        ) : null}
        <div className="@container">
          <ListCard
            label="Segments"
            busy={loading}
            state={state}
            header={state ? undefined : <ListHeaderRow columns={SEGMENT_GRID.columns} labels={SEGMENT_GRID.labels} align={SEGMENT_GRID.aligns} show={SEGMENT_GRID.headerShow} />}
          >
            {rows?.map((row) => <SegmentRow key={row.id} row={row} />)}
          </ListCard>
        </div>
      </div>
      {/* /segments/new: the builder modal over this list. */}
      <Outlet />
    </OrganizationsFrame>
  );
}

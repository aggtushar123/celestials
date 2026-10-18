import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapRow } from '../../components/canvas/MapRow';
import { usePagedList } from '../../components/campaigns/usePagedList';
import { MoreButton } from '../../components/organizations/portfolio/PortfolioSections';
import { fetchGallery } from '../../features/canvas/canvasApi';
import { SAY, SEARCH_DEBOUNCE_MS } from '../../features/canvas/canvasOptions';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { EmptyState, ErrorState, ListCard, LoadingState, PageHeader, SearchInput, Toolbar } from '../../components/ui';

/** Your maps across the records you can open (spec §2.3). */
export function CanvasPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [typed, setTyped] = useState(q);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (typed.trim() !== q) setParams(typed.trim() ? { q: typed.trim() } : {}, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [typed, q, setParams]);
  const list = usePagedList(q, (cursor) => fetchGallery(q, cursor), { error: 'Could not load maps.', more: 'Could not load more maps.' });
  const listRef = useRef<HTMLUListElement>(null);

  return (
    <OrganizationsFrame>
      <PageHeader title="Canvas" />
      <div className="flex flex-col gap-4 pb-6">
        <Toolbar search={<SearchInput label="Search maps by name or record" placeholder="Search maps" value={typed} onChange={setTyped} />} />
        {list.more.error && !list.next ? <p role="alert" className="text-[11px] leading-4 text-danger-ink">{list.more.error}</p> : null}
        <ListCard
          label="Maps"
          state={
            list.error ? (
              <ErrorState message={list.error} onRetry={list.retry} />
            ) : !list.rows ? (
              <LoadingState label="Loading maps" />
            ) : list.rows.length === 0 ? (
              <EmptyState title={SAY.NO_MAPS} detail={q ? 'No map or record matches that search.' : "Start one from an organisation's or account's Maps tab."} />
            ) : undefined
          }
          listRef={listRef}
          footer={list.next ? <MoreButton next={list.next} loading={list.more.busy} error={list.more.error} label="Show more" onClick={list.showMore} list={listRef} /> : undefined}
        >
          {list.rows?.map((row) => <MapRow key={row.id} row={row} showRecord />)}
        </ListCard>
      </div>
    </OrganizationsFrame>
  );
}

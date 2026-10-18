import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Outlet, useParams, useSearchParams } from 'react-router-dom';
import { ruleSentence } from '../../features/segments/ruleSentence';
import { fetchMembers } from '../../features/segments/segmentApi';
import { membersQuery, parseSegmentPage, toSegmentPageSearch, type SegmentPageParams } from '../../features/segments/segmentParams';
import type { Segment, SegmentMembersPage } from '../../features/segments/segmentTypes';
import { DismissibleAlert } from '../../components/organizations/portfolio/DismissibleAlert';
import { ChangesTab } from '../../components/segments/ChangesTab';
import { MembersTab } from '../../components/segments/MembersTab';
import { SegmentHeader } from '../../components/segments/SegmentHeader';
import { SegmentFailed, SegmentLoading, SegmentMissing } from '../../components/segments/SegmentStates';
import { SegmentTiles } from '../../components/segments/SegmentTiles';
import { useAttributes } from '../../components/segments/useBuilderOptions';
import { useSegment } from '../../components/segments/useSegment';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { NUM, PageHeader, Tabs, tabId, tabPanelId, TYPE } from '../../components/ui';
import type { SegmentOutlet } from './Builder';

const BACK = { to: '/segments', label: 'Segments' } as const;

/** /segments/:id (spec §3): the header, the tiles, "N more members you
 *  can't open" for a shared reader, then Members or Changes (`?tab=`). */
export function SegmentPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <PageHeader back={BACK} title="Segment" />
        <SegmentMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedSegment key={id} id={Number(id)} />;
}

function LoadedSegment({ id }: { id: number }) {
  const [load, replace, retry] = useSegment(id);
  if (load.status === 'ready') return <SegmentView segment={load.segment} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} title="Segment" />
      {load.status === 'loading' ? <SegmentLoading /> : null}
      {load.status === 'missing' ? <SegmentMissing /> : null}
      {load.status === 'failed' ? <SegmentFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

/** The tiles and hidden count: one `limit=1` read of the members, over all
 *  of them whatever the tab's search (plan Decision 7). The last totals stay
 *  while a reload after a pin is in flight. Its own `retry`, so the tiles'
 *  Try again never bumps `version` and refetches (and loses Show-more pages
 *  on) the members list below. */
function useTotals(id: number, version: number, retry: number) {
  const key = `${id}#${version}#${retry}`;
  const [answer, setAnswer] = useState<{ key: string; page: SegmentMembersPage<unknown> | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMembers<unknown>(id, 'limit=1').then(
      (page) => {
        if (alive) setAnswer({ key, page });
      },
      () => {
        if (alive) setAnswer({ key, page: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  return { page: answer?.page ?? null, failed: answer?.key === key && answer.page === null };
}

function SegmentView({ segment, onReplace }: { segment: Segment; onReplace: (segment: Segment) => void }) {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseSegmentPage(search, segment.kind), [search, segment.kind]);
  const update = useCallback(
    (patch: Partial<SegmentPageParams>) => setSearch(toSegmentPageSearch({ ...params, ...patch }), { replace: true }),
    [params, setSearch],
  );
  const idBase = useId();
  const attributes = useAttributes();
  const [version, setVersion] = useState(0);
  const [totalsRetry, setTotalsRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const totals = useTotals(segment.id, version, totalsRetry);
  const parts = useMemo(() => ruleSentence(segment.rules, segment.kind, segment.labels, attributes), [segment, attributes]);
  const hidden = totals.page?.hidden_count ?? 0;
  // The tab components draw their own role="tabpanel"; Tabs' ids make
  // it this tab's panel, so there is never a tabpanel inside a tabpanel.
  const panel = { id: tabPanelId(idBase, params.tab), labelledBy: tabId(idBase, params.tab) };

  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} />
      <div className="flex flex-col gap-4 pb-6">
        <SegmentHeader segment={segment} parts={parts} exportQuery={membersQuery(params, segment.kind)} onNotice={setNotice} />
        {notice ? <DismissibleAlert message={notice} onDismiss={() => setNotice(null)} /> : null}
        <div className="@container">
          <SegmentTiles summary={totals.page?.summary ?? null} kind={segment.kind} failed={totals.failed} onRetry={() => setTotalsRetry((v) => v + 1)} />
        </div>
        {hidden > 0 ? (
          <p data-part="hidden-members" className={TYPE.bodyMuted}>
            <span className={NUM}>{hidden}</span> more {hidden === 1 ? 'member' : 'members'} you can't open.
          </p>
        ) : null}
        <Tabs
          label="Segment views"
          idBase={idBase}
          value={params.tab}
          onChange={(tab) => update({ tab })}
          items={[
            { key: 'members', label: 'Members' },
            { key: 'changes', label: 'Changes' },
          ]}
        />
        {params.tab === 'members' ? (
          <MembersTab
            segment={segment}
            params={params}
            update={update}
            version={version}
            onChanged={(state) => {
              onReplace({ ...segment, ...state });
              setVersion((v) => v + 1);
            }}
            onNotice={setNotice}
            panel={panel}
          />
        ) : (
          <ChangesTab segment={segment} days={params.days} onDays={(days) => update({ days })} attributes={attributes} panel={panel} />
        )}
      </div>
      {/* /segments/:id/edit: the builder modal over this page. */}
      <Outlet context={{ segment, onReplace } satisfies SegmentOutlet} />
    </OrganizationsFrame>
  );
}

import { useCallback, useId, useMemo, useState } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { useMembers } from '../../features/knowledge/useMembers';
import { cleared, isFiltered, listQuery, parsePlanParams, readView, scopeOf, toPlanSearch, writeView, type PlanParams, type PlansView } from '../../features/plans/planParams';
import type { PersonRef } from '../../features/plans/planTypes';
import { PlanFilters } from '../../components/plans/PlanFilters';
import { PlansBoard } from '../../components/plans/PlansBoard';
import { PlansList } from '../../components/plans/PlansList';
import { useHasReports } from '../../components/plans/useHasReports';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { Card, LoadingState, PageHeader, Tabs, tabId, tabPanelId } from '../../components/ui';

/** /projects (spec 2.1), under the bar titled "Project Management"
 *  (Decision 2): List | Board as the bar's tabs (a view, remembered here:
 *  Decision 3), one toolbar, then the list or the board. New plan
 *  (/projects/new) opens its modal over this page through the Outlet. */
export function ProjectsHome() {
  const [search, setSearch] = useSearchParams();
  const params = parsePlanParams(search);
  const hasReports = useHasReports();
  const members = useMembers();
  const owners = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active).map(({ id, name }) => ({ id, name })), [members]);
  const change = useCallback((next: PlanParams) => setSearch(toPlanSearch(next), { replace: true }), [setSearch]);
  const [view, setView] = useState<PlansView>(readView);
  const pick = (next: PlansView) => {
    setView(next);
    writeView(next);
  };
  const scope = hasReports === null ? null : scopeOf(params, hasReports);
  const idBase = useId();
  const newPlanHref = `/projects/new${search.toString() ? `?${search.toString()}` : ''}`;
  return (
    <OrganizationsFrame>
      <PageHeader
        title="Project Management"
        tabs={
          <Tabs
            label="Plans view"
            idBase={idBase}
            value={view}
            onChange={pick}
            items={[
              { key: 'list', label: 'List' },
              { key: 'board', label: 'Board' },
            ]}
          />
        }
      />
      <div role="tabpanel" id={tabPanelId(idBase, view)} aria-labelledby={tabId(idBase, view)} className="flex flex-col gap-4 pb-6">
        {scope === null ? (
          <Card pad="none">
            <LoadingState label="Loading plans" count={5} />
          </Card>
        ) : (
          <>
            <PlanFilters params={params} scope={scope} view={view} owners={owners} onChange={change} newPlanHref={newPlanHref} />
            {view === 'list' ? (
              <PlansList query={listQuery(params, scope)} filtered={isFiltered(params)} onClear={() => change(cleared(params))} />
            ) : (
              <PlansBoard params={params} scope={scope} onChange={change} />
            )}
          </>
        )}
      </div>
      {/* /projects/new: the New plan modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}

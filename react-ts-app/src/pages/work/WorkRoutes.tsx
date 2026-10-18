import { useMemo } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { KeepQueryRedirect } from '../../components/work/KeepQueryRedirect';
import { chipOf, greetingText } from '../../features/work/feed';
import { queueOf, teamRedirect } from '../../features/work/queues';
import { useAppSelector } from '../../hooks';
import { ActivityRedirect } from './ActivityRedirect';
import { WorkInbox } from './WorkInbox';

/** The Work bar: "Work" (the queues are the rail, spec §8.1); on Work home's
 *  daily brief (Mine, no kind chip) the greeting takes its place (owner,
 *  2026-10-18: "Good morning should come where Work is written"). */
function WorkLayout() {
  const [params] = useSearchParams();
  const name = useAppSelector((state) => state.auth.user?.name ?? null);
  const hour = useMemo(() => new Date().getHours(), []);
  const { pathname } = useLocation();
  const brief = /^\/work\/?$/.test(pathname) && queueOf(params) === 'mine' && chipOf(params.get('kind')) === null;
  return (
    <>
      <PageHeader title={brief ? greetingText(hour, name) : 'Work'} />
      <Outlet />
    </>
  );
}

function TeamRedirect() {
  const { search, state } = useLocation();
  return <Navigate to={teamRedirect(search)} replace state={state} />;
}

/** /work/* (agent bundles D1 frontend Decision 1): the inbox at /work; the
 *  old pages redirect into it with their query and history state kept, so a
 *  bell's ?task= still opens the panel; anything unknown lands on /work. */
export function WorkRoutes() {
  return (
    <Routes>
      <Route element={<WorkLayout />}>
        <Route index element={<WorkInbox />} />
        <Route path="mine" element={<KeepQueryRedirect to="/work" set={{ queue: 'mine' }} />} />
        <Route path="today" element={<KeepQueryRedirect to="/work" set={{ queue: 'mine' }} />} />
        <Route path="recommended" element={<KeepQueryRedirect to="/work" set={{ kind: 'suggestion', queue: 'mine' }} />} />
        <Route path="team" element={<TeamRedirect />} />
        <Route path="activity" element={<ActivityRedirect />} />
        <Route path="*" element={<Navigate to="/work" replace />} />
      </Route>
    </Routes>
  );
}

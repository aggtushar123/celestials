import { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ScopeKey } from '../../../features/brain/brainTypes';

/** A Brain page's settled scope, with the path it settled on: BrainAskLayout
 *  uses it only while that path is the one on screen, so a report from the
 *  page being left never grounds a question on the next. `failed` is set
 *  once the page's own scope read has failed outright (so a bridge below
 *  never papers over that). */
export interface BrainScopeReport {
  path: string;
  scope: ScopeKey | null;
  failed?: boolean;
}

/** Each of the four Brain tabs reports its scope here (brain ask spec §2.2),
 *  as Organizations' pages report their filter options. Null outside
 *  BrainAskLayout. */
export const BrainScopeReportContext = createContext<((report: BrainScopeReport) => void) | null>(null);

/** Report `scope` (null until it settles) for the path on screen; `failed`
 *  once the page's own scope read has given up (fix wave item 2). */
export function useReportBrainScope(scope: ScopeKey | null, failed = false): void {
  const report = useContext(BrainScopeReportContext);
  const { pathname } = useLocation();
  useEffect(() => {
    if (report) report({ path: pathname, scope, failed });
  }, [report, pathname, scope, failed]);
}

/** The scope BrainAskLayout should ask with, for `pathname` (fix wave item
 *  2): the current path's own settled scope once there is one. Before that
 *  (a tab switch's fresh page briefly knows nothing) or while its read is
 *  still in flight, bridge to `lastScope` — the last scope settled on any
 *  Brain path — as long as the URL still names that same scope, so a tab
 *  switch that keeps the scope never flashes "Ask opens once this view
 *  loads." Null once the current path's own read fails, or the URL names a
 *  scope other than the one last settled (the scope is actually changing,
 *  not just the tab). */
export function resolveBrainScope(
  reported: BrainScopeReport | null,
  pathname: string,
  urlScope: string | null,
  lastScope: ScopeKey | null,
): ScopeKey | null {
  const current = reported && reported.path === pathname ? reported : null;
  if (current?.scope) return current.scope;
  if (current?.failed) return null;
  return lastScope !== null && lastScope === urlScope ? lastScope : null;
}

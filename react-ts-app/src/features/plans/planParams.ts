// /projects' URL state (Decision 4), the queries it sends (Contract notes 7,
// 8), and the remembered List / Board choice (Decision 3).
import { KINDS } from './planOptions';
import type { PlanKind, PlanStatus } from './planTypes';

export type PlanScope = 'mine' | 'tasks' | 'all';
export type StatusFilter = 'open' | 'draft' | 'done' | 'cancelled' | 'all';
export type PlansView = 'list' | 'board';

export interface PlanParams {
  /** Null: the default for the person (Decision 5). */
  scope: PlanScope | null;
  kind: PlanKind | '';
  owner: number | null;
  /** The List's only. */
  status: StatusFilter;
  q: string;
  /** The board's Show cancelled. */
  cancelled: boolean;
  /** The board's Show drafts (Agents delivery 2, Decision 11). */
  drafts: boolean;
}

const SCOPES: readonly string[] = ['mine', 'tasks', 'all'];
const FILTERS: readonly string[] = ['open', 'draft', 'done', 'cancelled', 'all'];
export const DEFAULT_PARAMS: PlanParams = { scope: null, kind: '', owner: null, status: 'open', q: '', cancelled: false, drafts: false };

export function parsePlanParams(search: URLSearchParams): PlanParams {
  const scope = search.get('scope') ?? '';
  const kind = search.get('kind') ?? '';
  const owner = search.get('owner') ?? '';
  const status = search.get('status') ?? '';
  return {
    scope: SCOPES.includes(scope) ? (scope as PlanScope) : null,
    kind: (KINDS as readonly string[]).includes(kind) ? (kind as PlanKind) : '',
    owner: /^[1-9]\d*$/.test(owner) ? Number(owner) : null,
    status: FILTERS.includes(status) ? (status as StatusFilter) : 'open',
    q: (search.get('q') ?? '').trim(),
    cancelled: search.get('cancelled') === '1',
    drafts: search.get('drafts') === '1',
  };
}

export function toPlanSearch(params: PlanParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (params.scope) out.scope = params.scope;
  if (params.kind) out.kind = params.kind;
  if (params.owner !== null) out.owner = String(params.owner);
  if (params.status !== 'open') out.status = params.status;
  if (params.q) out.q = params.q;
  if (params.cancelled) out.cancelled = '1';
  if (params.drafts) out.drafts = '1';
  return out;
}

export function scopeOf(params: PlanParams, hasReports: boolean): PlanScope {
  return params.scope ?? (hasReports ? 'all' : 'mine');
}

/** Mine is `owner=me` (the Owner filter is set aside); Has my tasks is `mine=tasks`. */
function baseQuery(params: PlanParams, scope: PlanScope): URLSearchParams {
  const query = new URLSearchParams();
  if (scope === 'mine') query.set('owner', 'me');
  else if (params.owner !== null) query.set('owner', String(params.owner));
  if (scope === 'tasks') query.set('mine', 'tasks');
  if (params.kind) query.set('kind', params.kind);
  if (params.q) query.set('q', params.q);
  return query;
}

/** GET plans/ for the List; All is open, draft, done and cancelled. */
export function listQuery(params: PlanParams, scope: PlanScope): string {
  const query = baseQuery(params, scope);
  for (const status of params.status === 'all' ? ['open', 'draft', 'done', 'cancelled'] : [params.status]) query.append('status', status);
  return query.toString();
}

/** GET plans/ for one board column. */
export function columnQuery(params: PlanParams, scope: PlanScope, status: PlanStatus): string {
  const query = baseQuery(params, scope);
  query.set('status', status);
  return query.toString();
}

export function isFiltered(params: PlanParams): boolean {
  return Boolean(params.kind) || params.owner !== null || Boolean(params.q) || params.status !== 'open';
}

export function cleared(params: PlanParams): PlanParams {
  return { ...DEFAULT_PARAMS, scope: params.scope, cancelled: params.cancelled, drafts: params.drafts };
}

export const VIEW_KEY = 'revenact_plans_view';

/** List unless Board was chosen here before; storage may be blocked. */
export function readView(): PlansView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

export function writeView(view: PlansView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // A private window or blocked storage: the choice lasts this visit only.
  }
}

/** The page's own query (the list's filters, a record's `?tab=`) without the
 *  modal's `?template=`, for the way back out of New plan. */
export function withoutTemplate(search: string): string {
  const next = new URLSearchParams(search);
  next.delete('template');
  const out = next.toString();
  return out ? `?${out}` : '';
}

/** /projects/new?template=<id> (Templates' Use, Decision 10). */
export function templateParam(search: URLSearchParams): number | null {
  const value = search.get('template') ?? '';
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

import { FUNCTION_LABELS } from '../auth/authSlice';
import { MAX_IDS } from '../organizations/portfolioParams';
import { NO_DEPARTMENT, PIPELINE_KINDS, type PipelineKind } from './pipelineKinds';
import type { PipelineKindKey } from './pipelineTypes';

// Everything the Pipelines page reads from its URL (spec §1: "Everything
// lives in the URL"). A value the backend would not understand is dropped
// here too (services/pipelines_portfolio/params.py), so a stale link still
// opens the page.

export type PipelineGroupKey = 'stage' | 'month' | 'parent' | 'owner' | 'department' | 'priority';
export type PipelineView = 'list' | 'board';
export type DateFilter = '' | '30' | '90' | '180' | 'overdue' | 'none';

export interface PipelineParams {
  /** `?kind=`; opportunities when absent. */
  kind: PipelineKindKey;
  search: string;
  /** Organisation ids. */
  organisation: string[];
  /** Account ids. */
  account: string[];
  /** A user id, 'unassigned', 'outside' ("Not in your book") or '' for everyone. */
  owner: string;
  /** [] is the view's default stages (defaultStages). */
  stage: string[];
  priority: string[];
  /** User.Function values; 'none' is the whole company. */
  department: string[];
  date: DateFilter;
  /** 'quarter': the stage last changed this calendar quarter. */
  changed: '' | 'quarter';
  ids: number[];
  sort: string;
  /** '' is "no grouping" (URL `group=none`, the List only). */
  group: PipelineGroupKey | '';
}

export const DEFAULT_PIPELINE_SORT = '-mrr';
/** Both views group by stage when the URL says nothing (spec §1). */
export const DEFAULT_PIPELINE_GROUP: PipelineGroupKey = 'stage';
const SORT_KEYS = ['mrr', 'date', 'priority', 'stage', 'title'];
const GROUP_KEYS: PipelineGroupKey[] = ['stage', 'month', 'parent', 'owner', 'department', 'priority'];
const DATE_FILTERS: DateFilter[] = ['30', '90', '180', 'overdue', 'none'];
const PRIORITIES = ['high', 'medium', 'low'];
const DEPARTMENTS = [...Object.keys(FUNCTION_LABELS), NO_DEPARTMENT];

/** Every filter off; the kind, sort and group stay. */
export const EMPTY_PIPELINE_FILTERS: Partial<PipelineParams> = {
  search: '',
  organisation: [],
  account: [],
  owner: '',
  stage: [],
  priority: [],
  department: [],
  date: '',
  changed: '',
  ids: [],
};

const list = (raw: string | null) =>
  (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

function only<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value));
}

export function parsePipelineParams(search: URLSearchParams): PipelineParams {
  const kind: PipelineKindKey = search.get('kind') === 'risks' ? 'risks' : 'opportunities';
  const stages = PIPELINE_KINDS[kind].stages.map((stage) => stage.value);
  const owner = search.get('owner') ?? '';
  const sort = search.get('sort');
  const group = search.get('group');
  const digits = (key: string) => list(search.get(key)).filter((value) => /^\d+$/.test(value));
  return {
    kind,
    search: (search.get('search') ?? '').trim(),
    organisation: digits('organisation'),
    account: digits('account'),
    owner: owner === 'unassigned' || owner === 'outside' || /^\d+$/.test(owner) ? owner : '',
    stage: only(list(search.get('stage')), stages),
    priority: only(list(search.get('priority')), PRIORITIES),
    department: only(list(search.get('department')), DEPARTMENTS),
    date: only([search.get('date') ?? ''], DATE_FILTERS)[0] ?? '',
    changed: search.get('changed') === 'quarter' ? 'quarter' : '',
    ids: digits('ids').map(Number).slice(0, MAX_IDS),
    sort: sort && SORT_KEYS.includes(sort.replace(/^-/, '')) ? sort : DEFAULT_PIPELINE_SORT,
    group: group === 'none' ? '' : (only([group ?? ''], GROUP_KEYS)[0] ?? DEFAULT_PIPELINE_GROUP),
  };
}

function setFilters(query: URLSearchParams, p: PipelineParams, stages: string[]) {
  if (p.search) query.set('search', p.search);
  if (p.organisation.length) query.set('organisation', p.organisation.join(','));
  if (p.account.length) query.set('account', p.account.join(','));
  if (p.owner) query.set('owner', p.owner);
  if (stages.length) query.set('stage', stages.join(','));
  if (p.priority.length) query.set('priority', p.priority.join(','));
  if (p.department.length) query.set('department', p.department.join(','));
  if (p.date) query.set('date', p.date);
  if (p.changed) query.set('changed', p.changed);
  if (p.ids.length) query.set('ids', p.ids.join(','));
}

/** The page URL's query: the kind only when it is risks, defaults left out,
 *  "no grouping" written as none. */
export function pipelineUrlSearch(p: PipelineParams): URLSearchParams {
  const query = new URLSearchParams();
  if (p.kind !== 'opportunities') query.set('kind', p.kind);
  setFilters(query, p, p.stage);
  if (p.sort !== DEFAULT_PIPELINE_SORT) query.set('sort', p.sort);
  if (p.group === '') query.set('group', 'none');
  else if (p.group !== DEFAULT_PIPELINE_GROUP) query.set('group', p.group);
  return query;
}

/** The stages a view lists when the URL names none: the open ones on the
 *  List (the server's default), every one on the Board (the contract: "the
 *  Board sends every stage"). */
export function defaultStages(kind: PipelineKind, view: PipelineView): string[] {
  return view === 'list' ? kind.openStages : kind.stages.map((stage) => stage.value);
}

/** The API's query (the kind is in the path, never here): the Board sends
 *  every stage when the URL names none; sort always, group when grouping,
 *  then `extra` (limit, cursor, group_value) as given. */
export function pipelineApiQuery(p: PipelineParams, view: PipelineView, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  const stages = p.stage.length || view === 'list' ? p.stage : defaultStages(PIPELINE_KINDS[p.kind], view);
  setFilters(query, p, stages);
  query.set('sort', p.sort);
  if (p.group) query.set('group', p.group);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return query.toString();
}

/** Whether any filter is on (a stage choice included): the empty state and
 *  "N of M" read it. */
export function hasPipelineFilters(p: PipelineParams): boolean {
  const query = new URLSearchParams();
  setFilters(query, p, p.stage);
  return query.toString() !== '';
}

/** What the Board reads: a board always has columns, so the List's "no
 *  grouping" reads as stage. Grouped params come back unchanged. */
export function boardPipelineParams(p: PipelineParams): PipelineParams {
  return p.group === '' ? { ...p, group: DEFAULT_PIPELINE_GROUP } : p;
}

/** The URL for the other kind (plan Decision 5): the shared filters stay;
 *  stage, changed and ids belong to one kind and go. One exception: the
 *  Closing / Due tile writes a 30 or 90 day window with the kind's open
 *  stages (ruling F3), so that narrowing becomes the new kind's open stages
 *  rather than leaving the window to take in closed items. */
export function withKind(search: URLSearchParams, kind: PipelineKindKey): URLSearchParams {
  const from = parsePipelineParams(search);
  const fromOpen = PIPELINE_KINDS[from.kind].openStages;
  const tileNarrowing =
    (from.date === '30' || from.date === '90') &&
    from.stage.length === fromOpen.length &&
    fromOpen.every((stage) => from.stage.includes(stage));
  const next = new URLSearchParams(search);
  for (const key of ['kind', 'stage', 'changed', 'ids']) next.delete(key);
  if (kind !== 'opportunities') next.set('kind', kind);
  if (tileNarrowing) next.set('stage', PIPELINE_KINDS[kind].openStages.join(','));
  return next;
}

// The Segments pages' URL state: the list's scope and search, and a
// segment page's tab, members search/sort/group and changes window. Values
// a kind does not take are dropped, as the backend drops them.
import { ACCOUNT_GROUP_OPTIONS, ACCOUNT_SORT_OPTIONS } from '../accounts/accountFields';
import { SORT_OPTIONS } from '../organizations/portfolioFields';
import { GROUP_OPTIONS, type GroupOption } from '../organizations/portfolioGroups';
import { DEFAULT_SORT } from '../organizations/portfolioParams';
import type { SegmentKind, SegmentScope } from './segmentTypes';

export const SCOPES: { value: SegmentScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Shared with me' },
];

export interface ListParams {
  scope: SegmentScope;
  search: string;
}

export function parseListParams(search: URLSearchParams): ListParams {
  const scope = search.get('scope');
  return {
    scope: scope === 'mine' || scope === 'shared' ? scope : 'all',
    search: (search.get('search') ?? '').trim(),
  };
}

export function toListSearch(p: ListParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.scope !== 'all') out.set('scope', p.scope);
  if (p.search) out.set('search', p.search);
  return out;
}

export type SegmentTab = 'members' | 'changes';
export const CHANGE_WINDOWS = [7, 30, 90] as const;
export type ChangeWindow = (typeof CHANGE_WINDOWS)[number];
export const MEMBERS_PAGE_SIZE = 50;
const DEFAULT_WINDOW: ChangeWindow = 30;

export interface SegmentPageParams {
  tab: SegmentTab;
  search: string;
  /** A sort key, '-' first when descending. Contacts ignore it (by name). */
  sort: string;
  /** '' is ungrouped. Contacts never group. */
  group: string;
  days: ChangeWindow;
}

export function memberSortOptions(kind: SegmentKind): { value: string; label: string }[] {
  if (kind === 'customer') return SORT_OPTIONS;
  if (kind === 'account') return ACCOUNT_SORT_OPTIONS;
  return [];
}

export function memberGroupOptions(kind: SegmentKind): GroupOption[] {
  if (kind === 'customer') return GROUP_OPTIONS;
  if (kind === 'account') return ACCOUNT_GROUP_OPTIONS;
  return [];
}

export function parseSegmentPage(search: URLSearchParams, kind: SegmentKind): SegmentPageParams {
  const sorts = memberSortOptions(kind).map((option) => option.value);
  const groups = memberGroupOptions(kind)
    .map((option) => option.value)
    .filter((value) => value !== 'none');
  const sort = search.get('sort') ?? '';
  const group = search.get('group') ?? '';
  const days = Number(search.get('days'));
  return {
    tab: search.get('tab') === 'changes' ? 'changes' : 'members',
    search: (search.get('search') ?? '').trim(),
    sort: sorts.includes(sort.replace(/^-/, '')) ? sort : DEFAULT_SORT,
    group: (groups as string[]).includes(group) ? group : '',
    days: (CHANGE_WINDOWS as readonly number[]).includes(days) ? (days as ChangeWindow) : DEFAULT_WINDOW,
  };
}

export function toSegmentPageSearch(p: SegmentPageParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'members') out.set('tab', p.tab);
  if (p.search) out.set('search', p.search);
  if (p.sort !== DEFAULT_SORT) out.set('sort', p.sort);
  if (p.group) out.set('group', p.group);
  if (p.days !== DEFAULT_WINDOW) out.set('days', String(p.days));
  return out;
}

/** The members endpoint's query: only names it passes on (sort, group,
 *  group_value, search, cursor and limit). Contacts are by name: search,
 *  cursor and limit only. */
export function membersQuery(p: SegmentPageParams, kind: SegmentKind, extra: Record<string, string> = {}): string {
  const out = new URLSearchParams();
  if (p.search) out.set('search', p.search);
  if (kind !== 'contact') {
    out.set('sort', p.sort);
    if (p.group) out.set('group', p.group);
  }
  for (const [key, value] of Object.entries(extra)) out.set(key, value);
  return out.toString();
}

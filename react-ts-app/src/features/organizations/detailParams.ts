import type { StoryFilters } from './storyApi';
import { isStoryGroup, isStoryKind, kindsIn } from './storyKinds';
import type { StoryGroup, StoryKind } from './storyTypes';

// The organization page's URL state (spec §1.4 and §1.5): the tab, the
// account chip and the story's filters. Unknown values read as the default.
// The story's part is shared with the account page (accountPageParams.ts).

export type DetailTab = 'story' | 'details' | 'people' | 'maps' | 'deals' | 'knowledge' | 'files';

export const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'details', label: 'Details' },
  { key: 'people', label: 'People' },
  { key: 'maps', label: 'Maps' },
  { key: 'deals', label: 'Deals & risks' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'files', label: 'Files' },
];

/** The story's filters in the URL, on either page. */
export interface StoryParams {
  /** An account id, 'none' (records on the organization itself), or '' for
   *  all. Always '' on the account page, which has no chips. */
  account: string;
  group: StoryGroup | '';
  sources: StoryKind[];
  q: string;
}

export interface DetailParams extends StoryParams {
  tab: DetailTab;
}

const TAB_KEYS: string[] = DETAIL_TABS.map((tab) => tab.key);

const accountValue = (raw: string | null) => (raw && (/^[1-9]\d*$/.test(raw) || raw === 'none') ? raw : '');

/** Sources are unique and inside the chosen group. */
export function normaliseStory<P extends StoryParams>(p: P): P {
  const allowed = kindsIn(p.group);
  return { ...p, sources: [...new Set(p.sources)].filter((kind) => allowed.includes(kind)) };
}

export function parseStoryParams(search: URLSearchParams): StoryParams {
  const group = search.get('group') ?? '';
  return normaliseStory({
    account: accountValue(search.get('account')),
    group: isStoryGroup(group) ? group : '',
    sources: (search.get('source') ?? '').split(',').filter(isStoryKind),
    q: search.get('q') ?? '',
  });
}

export function parseDetailParams(search: URLSearchParams): DetailParams {
  const tab = search.get('tab') ?? '';
  return { tab: TAB_KEYS.includes(tab) ? (tab as DetailTab) : 'story', ...parseStoryParams(search) };
}

/** Sources are written sorted, so equal filters make the same URL. */
export function writeStoryParams(out: URLSearchParams, p: StoryParams): void {
  if (p.account) out.set('account', p.account);
  if (p.group) out.set('group', p.group);
  if (p.sources.length) out.set('source', [...p.sources].sort().join(','));
  if (p.q) out.set('q', p.q);
}

export function toDetailSearch(p: DetailParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'story') out.set('tab', p.tab);
  writeStoryParams(out, p);
  return out;
}

export function withPatch(p: DetailParams, patch: Partial<DetailParams>): DetailParams {
  return normaliseStory({ ...p, ...patch });
}

export function storyFilters(p: StoryParams): StoryFilters {
  return { group: p.group, sources: p.sources, account: p.account, q: p.q };
}

export function hasStoryFilters(p: StoryParams): boolean {
  return Boolean(p.account || p.group || p.sources.length || p.q.trim());
}

/** The tabs the account chips filter (spec 2026-09-27 §1). Details and
 *  Knowledge are the whole organization's: the chips show there dimmed and
 *  filter nothing, while `?account=` is kept for the other tabs (owner,
 *  2026-09-28). */
export const ACCOUNT_TABS: ReadonlySet<DetailTab> = new Set<DetailTab>(['story', 'people', 'deals', 'files']);

/** Any page's tab keys: the organization page's and the account page's. */
export const detailTabId = (base: string, tab: string) => `${base}-tab-${tab}`;
/** One panel per tab: a visited tab stays mounted, hidden, while another shows. */
export const detailPanelId = (base: string, tab: string) => `${base}-panel-${tab}`;

import { normaliseStory, parseStoryParams, writeStoryParams, type StoryParams } from '../organizations/detailParams';

// The account page's URL state (spec 2026-09-29 §2.4): the tab and the
// story's filters. One account has no account chips, so `?account=` is never
// read or written. Unknown values read as the default.

export type AccountTab = 'story' | 'details' | 'people' | 'maps' | 'deals' | 'files' | 'objects';

/** Named ACCOUNT_PAGE_TABS, not ACCOUNT_TABS — that name is already the
 *  organization page's account-chip Set in detailParams.ts. */
export const ACCOUNT_PAGE_TABS: { key: AccountTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'details', label: 'Details' },
  { key: 'people', label: 'People' },
  { key: 'maps', label: 'Maps' },
  { key: 'deals', label: 'Deals & risks' },
  { key: 'files', label: 'Files' },
  { key: 'objects', label: 'Custom objects' },
];

export interface AccountPageParams extends StoryParams {
  tab: AccountTab;
}

const TAB_KEYS: string[] = ACCOUNT_PAGE_TABS.map((tab) => tab.key);

/** An old `?tab=canvases` link reads as Maps (canvas spec §2.1, Decision 2). */
export function parseAccountPageParams(search: URLSearchParams): AccountPageParams {
  const raw = search.get('tab') ?? '';
  const tab = raw === 'canvases' ? 'maps' : raw;
  return { ...parseStoryParams(search), account: '', tab: TAB_KEYS.includes(tab) ? (tab as AccountTab) : 'story' };
}

export function toAccountPageSearch(p: AccountPageParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'story') out.set('tab', p.tab);
  writeStoryParams(out, { ...p, account: '' });
  return out;
}

export function withAccountPagePatch(p: AccountPageParams, patch: Partial<AccountPageParams>): AccountPageParams {
  return normaliseStory({ ...p, ...patch, account: '' });
}

/** `/accounts/12` gives 12; anything but a positive whole number is no account. */
export function parseAccountId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

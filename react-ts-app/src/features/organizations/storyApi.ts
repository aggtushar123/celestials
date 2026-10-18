// The story endpoints (organisation spec §2; account spec 2026-09-29 §2),
// through apiFetch (/api/v1 prefix). A bare number is an organisation id,
// as every caller passed before the account page.
import { apiFetch } from '../../lib/apiClient';
import { storyPathOf, storyScope, type StoryTarget } from './detailScope';
import type { StoryGroup, StoryKind, StoryItem, StoryResponse } from './storyTypes';

export const STORY_PAGE_SIZE = 30;

export const storyPath = (target: StoryTarget) => storyPathOf(storyScope(target));

export interface StoryFilters {
  group: StoryGroup | '';
  sources: StoryKind[];
  /** An account id, 'none' for the organization itself, or '' for all. */
  account: string;
  q: string;
}

/** The query for these filters in one fixed order, sources sorted, so equal
 *  filters make an equal string (the paging key). The backend binds its cursor to the same
 *  filters, so a changed filter always starts from page one. */
export function storyQuery(f: StoryFilters, limit = STORY_PAGE_SIZE): string {
  const query = new URLSearchParams();
  if (f.group) query.set('group', f.group);
  if (f.sources.length) query.set('source', [...f.sources].sort().join(','));
  if (f.account) query.set('account', f.account);
  if (f.q.trim()) query.set('q', f.q.trim());
  query.set('limit', String(limit));
  return query.toString();
}

/** One page of the story at `path`. The cursor is opaque and passed back exactly as it came. */
export function fetchStoryAt(path: string, query: string, cursor?: string | null): Promise<StoryResponse> {
  const full = cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query;
  return apiFetch<StoryResponse>(`${path}?${full}`);
}

export function fetchStory(target: StoryTarget, query: string, cursor?: string | null): Promise<StoryResponse> {
  return fetchStoryAt(storyPath(target), query, cursor);
}

export const THREAD_PAGE_SIZE = 100;

/** One email thread, oldest first: the story read with `thread` (the backend
 *  has no thread endpoint). It returns that thread's emails only, across the
 *  page's scope, under the same rules; no other filter is sent, so the whole
 *  thread shows whatever chip is on. Its counts and attention are not
 *  narrowed and are not used here. */
export async function fetchThreadAt(path: string, threadId: string): Promise<StoryItem[]> {
  const query = new URLSearchParams({ thread: threadId, limit: String(THREAD_PAGE_SIZE) }).toString();
  const items: StoryItem[] = [];
  let cursor: string | null = null;
  do {
    const page: StoryResponse = await fetchStoryAt(path, query, cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items.reverse();
}

export function fetchThread(target: StoryTarget, threadId: string): Promise<StoryItem[]> {
  return fetchThreadAt(storyPath(target), threadId);
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryTarget } from '../../../features/organizations/detailScope';
import { fetchStoryAt, storyPath } from '../../../features/organizations/storyApi';
import type { StoryItem, StoryResponse } from '../../../features/organizations/storyTypes';
import { errorMessage } from '../portfolio/usePortfolio';

type Loaded = { key: string; data: StoryResponse; items: StoryItem[]; next: string | null } | { key: string; error: string };
type More = { key: string; loading: boolean; error: string | null };

export interface StoryState {
  /** Page one of the latest answer (its counts and attention). While a new
   *  query loads the previous answer stays, so the page does not flash empty. */
  data: StoryResponse | null;
  items: StoryItem[];
  /** The next page's cursor, for the current query only. */
  next: string | null;
  /** Page one of the current query has not landed yet. */
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore: () => Promise<void>;
  retry: () => void;
}

/** The story, cursor-paged (spec §2 "Paging"): an organisation's (a bare id)
 *  or one account's (a scope). Keyed by its endpoint, so a scope object made
 *  afresh each render never reads again. `version` reloads it (after
 *  "+ Add"); `enabled` is off while another tab is open. */
export function useStory(target: StoryTarget, query: string, version: number, enabled: boolean): StoryState {
  const path = storyPath(target);
  const [attempt, setAttempt] = useState(0);
  const key = `${path}?${query}#${version}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [more, setMore] = useState<More | null>(null);
  // Bumped whenever the read changes or unmounts, so a page two that lands
  // for an older read is dropped rather than appended to a newer one.
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchStoryAt(path, query).then(
      (data) => {
        if (!cancelled) setLoaded({ key, data, items: data.items, next: data.next_cursor });
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ key, error: errorMessage(err, 'Could not load the story.') });
      },
    );
    return () => {
      cancelled = true;
      generation.current += 1;
      inFlight.current = false;
    };
  }, [enabled, key, path, query]);

  const current = loaded && 'data' in loaded ? loaded : null;
  // The latest `current`, read through a ref so `loadMore` keeps one
  // identity while pages land (see the organisation page's history).
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  });

  const loadMore = useCallback(async () => {
    const latest = currentRef.current;
    if (!latest || latest.key !== key || !latest.next || inFlight.current) return;
    const token = generation.current;
    inFlight.current = true;
    setMore({ key, loading: true, error: null });
    try {
      const page = await fetchStoryAt(path, query, latest.next);
      if (generation.current !== token) return;
      setLoaded((prev) =>
        prev && 'data' in prev && prev.key === key
          ? { ...prev, items: [...prev.items, ...page.items], next: page.next_cursor }
          : prev,
      );
      setMore({ key, loading: false, error: null });
    } catch (err) {
      if (generation.current !== token) return;
      setMore({ key, loading: false, error: errorMessage(err, 'Could not load more of the story.') });
    } finally {
      if (generation.current === token) inFlight.current = false;
    }
  }, [key, path, query]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    data: current?.data ?? null,
    items: current?.items ?? [],
    next: current && current.key === key ? current.next : null,
    loading: enabled && loaded?.key !== key,
    error: loaded && 'error' in loaded && loaded.key === key ? loaded.error : null,
    loadingMore: more?.key === key ? more.loading : false,
    moreError: more?.key === key ? more.error : null,
    loadMore,
    retry,
  };
}

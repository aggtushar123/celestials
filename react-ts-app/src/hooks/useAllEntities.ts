import { useEffect, useState } from 'react';
import { ApiError } from '../lib/apiClient';

// One entity's own "every record, loaded once while this consumer is
// enabled" state — extracted from SettingsPage.tsx, which was the first
// caller. `fetcher` is either `fetchAllPages` (a genuinely paginated
// endpoint) or a bare `apiFetch<T[]>` (an endpoint that returns a plain
// array — see fetchAllPages's own docstring on which is which).
export function useAllEntities<T>(fetcher: () => Promise<T[]>, entityLabel: string, enabled: boolean) {
  const [entities, setEntities] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const all = await fetcher();
        if (!cancelled) setEntities(all);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : `Could not load ${entityLabel}s.`);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher/entityLabel are constant per call site
  }, [enabled]);

  return { entities, isLoading, error };
}

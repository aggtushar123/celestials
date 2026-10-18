import { useCallback, useEffect, useState } from 'react';
import { fetchBundle } from '../../features/agents/bundlesApi';
import { BUNDLE } from '../../features/agents/bundleText';
import type { Bundle } from '../../features/agents/bundleTypes';
import { isMissing } from '../../features/work/workApi';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** GET /agents/bundles/<id>/ (contract §5.4): a 404 is `lost` (gone, or on a
 *  record the reader can't open), never an error to retry. */
export function useBundle(id: number) {
  const [attempt, setAttempt] = useState(0);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchBundle(id).then(
      (answer) => {
        if (!alive) return;
        setBundle(answer);
        setError(null);
      },
      (err: unknown) => {
        if (!alive) return;
        if (isMissing(err)) setLost(true);
        else setError(errorMessage(err, BUNDLE.LOAD));
      },
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const lose = useCallback(() => setLost(true), []);
  return { bundle, error, lost, retry, replace: setBundle, lose };
}

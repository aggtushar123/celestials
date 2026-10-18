import { useCallback, useEffect, useState } from 'react';
import { csatBreakdown } from '../../../features/accounts/csat';
import type { CsatBreakdown, Survey } from '../../../features/customers/customersSlice';
import { apiFetch } from '../../../lib/apiClient';
import { errorMessage } from '../../organizations/portfolio/usePortfolio';

type Load = { key: string; breakdown: CsatBreakdown } | { key: string; error: string };

/** How the account's answered CSAT surveys spread (decision 4): its surveys
 *  (GET /accounts/<id>/surveys/, the account's rule) banded as the backend
 *  bands an organisation's. */
export function useAccountCsat(accountId: number): { breakdown: CsatBreakdown | null; error: string | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${accountId}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Survey[]>(`/accounts/${accountId}/surveys/`).then(
      (surveys) => {
        if (!cancelled) setLoad({ key, breakdown: csatBreakdown(Array.isArray(surveys) ? surveys : []) });
      },
      (err: unknown) => {
        if (!cancelled) setLoad({ key, error: errorMessage(err, 'Could not load the CSAT responses.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accountId, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = load && load.key === key ? load : null;
  return {
    breakdown: current && 'breakdown' in current ? current.breakdown : null,
    error: current && 'error' in current ? current.error : null,
    retry,
  };
}

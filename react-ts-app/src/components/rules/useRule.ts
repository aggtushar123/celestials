import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchRule } from '../../features/rules/ruleApi';
import type { Rule } from '../../features/rules/ruleTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type RuleLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; rule: Rule };

/** One rule, read for the reader: `missing` for a 404, the same for a rule
 *  that does not exist and one not shared with them. `replace` swaps in a
 *  newer copy (an edit, a switch); `retry` reads again. */
export function useRule(id: number): [RuleLoad, (rule: Rule) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: RuleLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRule(id).then(
      (rule) => {
        if (alive) setAnswer({ key, load: { status: 'ready', rule } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this rule.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((rule: Rule) => setAnswer({ key, load: { status: 'ready', rule } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}

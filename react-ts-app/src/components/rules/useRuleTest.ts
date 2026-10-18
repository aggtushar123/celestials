import { useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { testRule } from '../../features/rules/ruleApi';
import { ruleErrors, type RuleErrors } from '../../features/rules/ruleErrors';
import type { RuleTestRequest, RuleTestResult } from '../../features/rules/ruleTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type TestState =
  | { status: 'idle' }
  | { status: 'loading'; key: string }
  | { status: 'done'; key: string; result: RuleTestResult }
  | { status: 'error'; key: string; message: string };

/** Test this rule (spec §2.2, plan Decision 7): the server's dry run, on
 *  click only. An answer shows only while the rule is as it was tested, so
 *  a late answer for an older rule is dropped. A refusal of the body (400,
 *  403, 404) comes back as field errors; anything else is the panel's.
 *  `dispatched` is the count of clicks so far: `run()` captures its own
 *  click number and, once the server answers, checks it is still the latest
 *  before doing anything: a response whose click has since been superseded
 *  by a newer one is dropped outright (no `setState`, no returned errors),
 *  so a slow older answer can never clobber (or report on behalf of) one
 *  that already landed. */
export function useRuleTest(request: RuleTestRequest | null): { state: TestState; run: () => Promise<RuleErrors | null> } {
  const key = JSON.stringify(request);
  const [state, setState] = useState<TestState>({ status: 'idle' });
  const dispatched = useRef(0);

  async function run(): Promise<RuleErrors | null> {
    if (!request) return null;
    const asked = key;
    const click = ++dispatched.current;
    setState({ status: 'loading', key: asked });
    try {
      const result = await testRule(request);
      if (click !== dispatched.current) return null;
      setState({ status: 'done', key: asked, result });
      return null;
    } catch (err) {
      if (click !== dispatched.current) return null;
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        setState({ status: 'idle' });
        return ruleErrors(err, 'Could not test this rule.');
      }
      setState({ status: 'error', key: asked, message: errorMessage(err, 'Could not test this rule. Try again.') });
      return null;
    }
  }

  return { state: state.status !== 'idle' && state.key === key ? state : { status: 'idle' }, run };
}

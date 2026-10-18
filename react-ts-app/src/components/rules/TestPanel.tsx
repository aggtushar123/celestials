import { useId } from 'react';
import type { RuleErrors } from '../../features/rules/ruleErrors';
import { campaignTestParts, CROSSED_NOTE, planTestParts, testLines, testSummary } from '../../features/rules/ruleText';
import type { RuleTestRequest, RuleTestResult } from '../../features/rules/ruleTypes';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { BUTTON, NUM, TYPE } from '../ui';
import { Lines } from '../surveys/Lines';
import { Parts } from './Parts';
import { useRuleTest } from './useRuleTest';

function TestResult({ result, kind, cooldownDays, crossed }: { result: RuleTestResult; kind: SegmentKind | null; cooldownDays: number; crossed: boolean }) {
  const summary = testSummary(result, kind);
  const lines = testLines(result, cooldownDays);
  return (
    <div data-part="test-result" className="flex flex-col gap-1">
      <p data-part="matches" className={TYPE.body}>
        <span className={`${TYPE.display} ${NUM}`}>{summary.n}</span> {summary.text}
      </p>
      {lines.length > 0 ? (
        <p className={TYPE.bodyMuted}>
          <Lines lines={lines} />
        </p>
      ) : null}
      {result.plans ? (
        <p data-part="plans" className={TYPE.bodyMuted}>
          <Parts parts={planTestParts(result.plans)} />
        </p>
      ) : null}
      {result.campaigns ? (
        <p data-part="campaigns" className={TYPE.bodyMuted}>
          <Parts parts={campaignTestParts(result.campaigns)} />
        </p>
      ) : null}
      {crossed ? <p className={TYPE.meta}>{CROSSED_NOTE}</p> : null}
    </div>
  );
}

/** Test this rule (spec §2.2): asks only when the form's own check passes
 *  (`onCheck`); a refused body goes back to the form's fields (`onRefused`). */
export function TestPanel({ request, blocker, kind, cooldownDays, crossed, onCheck, onRefused }: {
  request: RuleTestRequest | null;
  /** Why it can't be tested yet, or null. */
  blocker: string | null;
  kind: SegmentKind | null;
  cooldownDays: number;
  crossed: boolean;
  onCheck: () => boolean;
  onRefused: (errors: RuleErrors) => void;
}) {
  const { state, run } = useRuleTest(request);
  const reasonId = useId();

  async function test() {
    if (!onCheck()) return;
    const refused = await run();
    if (refused) onRefused(refused);
  }

  return (
    <section aria-label="Test this rule" className="flex flex-col gap-2 border-t border-line-subtle pt-4 lg:border-t-0 lg:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void test()}
          disabled={blocker !== null || state.status === 'loading'}
          aria-describedby={blocker ? reasonId : undefined}
          className={BUTTON}
        >
          {state.status === 'loading' ? 'Testing…' : 'Test this rule'}
        </button>
        {blocker ? (
          <p id={reasonId} className={TYPE.meta}>
            {blocker}
          </p>
        ) : null}
      </div>
      <div aria-live="polite">
        {state.status === 'done' ? <TestResult result={state.result} kind={kind} cooldownDays={cooldownDays} crossed={crossed} /> : null}
        {state.status === 'error' ? (
          <p role="alert" className="text-[13px] leading-5 text-danger-ink">
            {state.message}
          </p>
        ) : null}
        {state.status === 'idle' ? <p className={TYPE.meta}>Who it would act on, from your segment as it is now. Nothing is changed.</p> : null}
      </div>
    </section>
  );
}

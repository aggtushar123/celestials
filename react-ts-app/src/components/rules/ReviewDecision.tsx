import { useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { approveReview, skipReview } from '../../features/rules/ruleApi';
import { isRuleChanged, refusalText, RULE_CHANGED } from '../../features/rules/ruleText';
import type { ApproveAnswer } from '../../features/rules/ruleTypes';
import { dayText } from '../../features/segments/ruleSentence';
import { BUTTON, FOCUS, QUIET } from '../ui';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';

export const REVIEW_DECIDED = 'That review was already decided.';

export interface ReviewDecisionProps {
  reviewId: number;
  kind: 'survey' | 'campaign';
  ruleName: string;
  /** The night it came from, when the caller has it: named in the skip sentence. */
  runOn?: string;
  /** A refusal the server stored on the review, when the caller has it. */
  storedRefusal?: Record<string, unknown>;
  /** Approved: the send it created. The caller opens it. */
  onApproved: (answer: ApproveAnswer) => void;
  /** The review left the queue (skipped, decided elsewhere, or expired); `message` says which. */
  onGone: (message: string) => void;
  /** Surveys or Campaigns refused it; the server now stores this on the review. */
  onRefused?: (error: Record<string, unknown>) => void;
}

/** Approve or Skip one rule review (rules spec §2.4; Waiting spec §2.1), each
 *  sent once. A refusal shows at Approve and takes focus; a 409, a 404 or the
 *  backend's RULE_CHANGED gives the review up, saying why. */
export function ReviewDecision({ reviewId, kind, ruleName, runOn, storedRefusal, onApproved, onGone, onRefused }: ReviewDecisionProps) {
  const refusalId = useId();
  const refusalRef = useRef<HTMLParagraphElement>(null);
  const [refusedTick, setRefusedTick] = useState(0);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState<'approve' | 'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (refusedTick > 0) refusalRef.current?.focus();
  }, [refusedTick]);

  const refusal = refusalText(latest ?? storedRefusal);
  const noun = kind === 'campaign' ? 'campaign' : 'survey';
  const decidedElsewhere = (err: unknown) => err instanceof ApiError && (err.status === 409 || err.status === 404);

  async function approve() {
    const outcome = await run(() => {
      setPending('approve');
      setError(null);
      return approveReview(reviewId);
    });
    if (!outcome) return;
    if (outcome.ok) {
      onApproved(outcome.value);
      return;
    }
    const err = outcome.error;
    setPending(null);
    if (decidedElsewhere(err)) onGone(REVIEW_DECIDED);
    else if (err instanceof ApiError && err.status === 400 && isRuleChanged(err.body)) onGone(RULE_CHANGED);
    else if (err instanceof ApiError && err.status === 400 && err.body !== null && typeof err.body === 'object') {
      const body = err.body as Record<string, unknown>;
      setLatest(body);
      setRefusedTick((n) => n + 1);
      onRefused?.(body);
    } else setError(errorMessage(err, 'Could not approve it. Try again.'));
  }

  async function skip() {
    const outcome = await run(() => {
      setPending('skip');
      setError(null);
      return skipReview(reviewId);
    });
    if (!outcome) return;
    if (outcome.ok) {
      onGone(`Skipped the ${noun} from ${ruleName}${runOn ? ` for ${dayText(runOn)}` : ''}.`);
      return;
    }
    setPending(null);
    if (decidedElsewhere(outcome.error)) onGone(REVIEW_DECIDED);
    else setError(errorMessage(outcome.error, 'Could not skip it. Try again.'));
  }

  return (
    <div className="flex flex-col gap-2">
      {refusal ? (
        <p ref={refusalRef} id={refusalId} data-part="refusal" data-error role="alert" tabIndex={-1} className={`text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
          {kind === 'campaign' ? 'Campaigns' : 'Surveys'} refused it: {refusal} Fix it, then approve again, or skip it.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void approve()} disabled={busy} aria-describedby={refusal ? refusalId : undefined} className={BUTTON}>
          {pending === 'approve' ? 'Sending…' : 'Approve'}
        </button>
        <button type="button" onClick={() => void skip()} disabled={busy} className={QUIET}>
          {pending === 'skip' ? 'Skipping…' : 'Skip'}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { refusalDetail, runAgent } from '../../features/agents/agentsApi';
import { runAnswerText } from '../../features/agents/agentsText';
import { TEAM_QUEUE } from '../../features/work/teamQueue';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, TYPE } from '../ui';
import { feedChanged, taskChanged } from './taskChanges';

/** Ask the agent (spec §5 Team; frontend Decision 6): runs the Ops agent
 *  now, from Team at Company scope, for view-all readers. Held after a
 *  success until the queue's next whole read has landed or failed (`reads`
 *  moves past the value at the success), so a second press cannot spend
 *  credits twice; a refusal frees it at once. Nothing releases it while the
 *  run is in flight. */
export function AskTheAgent({ reads, onRan }: { reads: number; onRan: () => void }) {
  const { busy, run, release } = useSubmitOnce({ holdOnSuccess: true });
  const [said, setSaid] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const readsNow = useRef(reads);
  useEffect(() => {
    readsNow.current = reads;
  }, [reads]);
  // The `reads` value when the last run succeeded; held until it moves past.
  const [heldAt, setHeldAt] = useState<number | null>(null);
  const held = heldAt !== null && reads <= heldAt;
  useEffect(() => {
    if (heldAt !== null && reads > heldAt) release();
  }, [heldAt, reads, release]);

  async function ask() {
    if (busy || held) return;
    // Cleared only when this press really starts a run: a second press of a
    // double click can land after the first run answered but before React
    // re-rendered (busy and held still read false here), and must not wipe
    // the line the first run just said.
    const outcome = await run(() => {
      setFailed(null);
      setSaid(null);
      return runAgent('ops');
    });
    if (!outcome) return;
    if (outcome.ok) {
      setSaid(runAnswerText(outcome.value));
      setHeldAt(readsNow.current);
      onRan();
      feedChanged();
      if ((outcome.value.last_run?.applied ?? 0) > 0) taskChanged();
    } else setFailed(refusalDetail(outcome.error) ?? errorMessage(outcome.error, TEAM_QUEUE.ASK_FAILED));
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button type="button" onClick={() => void ask()} aria-disabled={busy || held || undefined} className={BUTTON}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {busy ? TEAM_QUEUE.ASKING : TEAM_QUEUE.ASK}
      </button>
      <p className={TYPE.meta}>{TEAM_QUEUE.ASK_HINT}</p>
      <p role="status" className={`${TYPE.bodyMuted} empty:sr-only`}>
        {said ?? ''}
      </p>
      {failed ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {failed}
        </p>
      ) : null}
    </div>
  );
}

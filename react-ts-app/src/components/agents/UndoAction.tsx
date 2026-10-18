import { useEffect, useRef, useState } from 'react';
import { refusalBody, refusalCode, refusalDetail, undoAction } from '../../features/agents/agentsApi';
import { AGENTS, undoReasonText } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { FOCUS, NUM, QUIET, TYPE } from '../ui';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { taskChanged } from '../work/taskChanges';
import { sentence } from '../../lib/sentence';

interface Refused {
  text: string;
  current: string | null;
  applied: string | null;
}

/** Undo for 7 days (spec §1.5; Decision 11): shown while `undo` is set; the
 *  reason instead of the button when it is not allowed; every refusal stays
 *  here in the server's words, CHANGED_SINCE with both values. */
export function UndoAction({ action, onUndone }: { action: AgentAction; onUndone: (answer: AgentAction, text: string) => void }) {
  const [refused, setRefused] = useState<Refused | null>(null);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);
  if (!action.undo) return null;
  if (!action.undo.allowed) {
    return action.undo.reason ? <p className={TYPE.meta}>{undoReasonText(action.undo.reason)}</p> : null;
  }

  async function undo() {
    setRefused(null);
    const outcome = await run(() => undoAction(action.id));
    if (!outcome) return;
    if (outcome.ok) {
      taskChanged();
      onUndone(outcome.value.action, sentence(`Undone: ${outcome.value.action.title}`));
      return;
    }
    const err = outcome.error;
    const body = refusalBody(err);
    // Someone else undid it first: the row catches up, in the server's words.
    if (refusalCode(err) === 'ALREADY_DECIDED' && body && typeof body.action === 'object' && body.action !== null) {
      taskChanged();
      onUndone(body.action as AgentAction, refusalDetail(err) ?? AGENTS.UNDO_FAILED);
      return;
    }
    const changed = refusalCode(err) === 'CHANGED_SINCE' && body;
    setRefused({
      text: refusalDetail(err) ?? errorMessage(err, AGENTS.UNDO_FAILED),
      current: changed && typeof body.current === 'string' ? body.current : null,
      applied: changed && typeof body.applied === 'string' ? body.applied : null,
    });
    setTick((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={() => void undo()} className={`${QUIET} self-start`}>
        {busy ? AGENTS.UNDOING : AGENTS.UNDO}
      </button>
      {refused ? (
        <div ref={alertRef} role="alert" tabIndex={-1} className={`flex flex-col gap-0.5 text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
          <p>{refused.text}</p>
          {refused.current !== null && refused.applied !== null ? (
            <p className="text-[11px] leading-4 text-ink">
              Now: <span className={NUM}>{refused.current}</span> · Agent set: <span className={NUM}>{refused.applied}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

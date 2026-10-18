import { useEffect, useId, useRef, useState } from 'react';
import { approveAction, refusalCode, refusalDetail, rejectAction } from '../../features/agents/agentsApi';
import { AGENTS } from '../../features/agents/agentsText';
import type { AgentAction } from '../../features/agents/agentTypes';
import { ApiError } from '../../lib/apiClient';
import { BUTTON, FOCUS, INPUT, QUIET, TYPE } from '../ui';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { recommendationsChanged, taskChanged } from '../work/taskChanges';
import { sentence } from '../../lib/sentence';

const LONGEST = 255;

/** Apply, or Reject with an optional note, one agent action, sent once
 *  (contract approve/reject). 404, 409 ALREADY_DECIDED and 409 EXPIRED
 *  mean it was decided elsewhere or lapsed: it leaves, in the server's
 *  words. A 403 CANT_DECIDE stays at the buttons; `onRefused`
 *  (Recommended passes it) makes that page read its list again, Waiting does not. */
export function AgentActionDecision({
  action,
  onSettled,
  onGone,
  onRefused,
}: {
  action: AgentAction;
  onSettled: (answer: AgentAction, text: string) => void;
  onGone: (text: string) => void;
  onRefused?: () => void;
}) {
  const noteId = useId();
  const errorId = useId();
  const noteErrorId = useId();
  const hintId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const cancelled = useRef(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [pending, setPending] = useState<'apply' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (tick > 0) errorRef.current?.focus();
  }, [tick]);
  useEffect(() => {
    if (!rejecting && cancelled.current) {
      cancelled.current = false;
      rejectRef.current?.focus();
    }
  }, [rejecting]);

  async function decide(verb: 'apply' | 'reject') {
    if (verb === 'reject' && note.trim().length > LONGEST) {
      setNoteError(AGENTS.NOTE_TOO_LONG);
      return;
    }
    const outcome = await run(() => {
      setPending(verb);
      setError(null);
      return verb === 'apply' ? approveAction(action.id) : rejectAction(action.id, note.trim());
    });
    if (!outcome) return;
    if (outcome.ok) {
      recommendationsChanged();
      taskChanged();
      setPending(null);
      onSettled(outcome.value.action, sentence(`${verb === 'apply' ? 'Applied' : 'Rejected'}: ${action.title}`));
      return;
    }
    setPending(null);
    const err = outcome.error;
    const code = refusalCode(err);
    if (err instanceof ApiError && err.status === 404) {
      recommendationsChanged();
      taskChanged();
      onGone(AGENTS.GONE);
    } else if (err instanceof ApiError && err.status === 409 && (code === 'ALREADY_DECIDED' || code === 'EXPIRED')) {
      recommendationsChanged();
      taskChanged();
      onGone(refusalDetail(err) ?? AGENTS.GONE);
    } else {
      setError(refusalDetail(err) ?? errorMessage(err, AGENTS.DECIDE_FAILED));
      setTick((n) => n + 1);
      if (code === 'CANT_DECIDE') onRefused?.();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p ref={errorRef} id={errorId} role="alert" tabIndex={-1} className={`text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
          {error}
        </p>
      ) : null}
      {rejecting ? (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void decide('reject');
          }}
        >
          <label htmlFor={noteId} className={TYPE.label}>
            {AGENTS.WHY_NOT}
          </label>
          <input
            id={noteId}
            value={note}
            aria-invalid={Boolean(noteError)}
            aria-describedby={noteError ? `${hintId} ${noteErrorId}` : hintId}
            onChange={(event) => {
              setNote(event.target.value);
              setNoteError(null);
            }}
            className={INPUT}
            autoFocus
          />
          <p id={hintId} className={TYPE.meta}>
            {AGENTS.NOTE_HINT}
          </p>
          {noteError ? (
            <p id={noteErrorId} role="alert" className="text-[11px] leading-4 text-danger-ink">
              {noteError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} aria-describedby={error ? errorId : undefined} className={BUTTON}>
              {pending === 'reject' ? AGENTS.WORKING : AGENTS.REJECT_IT}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                cancelled.current = true;
                setRejecting(false);
              }}
              className={QUIET}
            >
              {AGENTS.CANCEL}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void decide('apply')} aria-describedby={error ? errorId : undefined} className={BUTTON}>
            {pending === 'apply' ? AGENTS.WORKING : AGENTS.APPLY}
          </button>
          <button ref={rejectRef} type="button" disabled={busy} onClick={() => setRejecting(true)} className={QUIET}>
            {AGENTS.REJECT}
          </button>
        </div>
      )}
    </div>
  );
}

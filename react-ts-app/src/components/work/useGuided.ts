import { useCallback, useRef, useState } from 'react';
import { retryStep, runStep, stopBundle } from '../../features/agents/bundlesApi';
import { readRunRefusal } from '../../features/agents/bundleText';
import type { Bundle, BundleAnswer } from '../../features/agents/bundleTypes';
import { GUIDED, changedEmail, emailDraftOf, nextStepOf, type EmailDraft } from '../../features/agents/guidedText';
import { feedChanged, taskChanged } from './taskChanges';
import type { useBundle } from './useBundle';

type Load = ReturnType<typeof useBundle>;

/** What is on its way: the step asked now running, a stop, or a retry. */
export type GuidedPending = { what: 'run' | 'retry'; step: number } | { what: 'stop' } | null;

/** A guided bundle's answers (guided agent, 2026-10-18): Yes runs the step
 *  asked now (with the email's edited fields), Not now stops the bundle,
 *  Retry retries a failed step. Each answer replaces the bundle; a refusal
 *  that carries the bundle as it is now (NOT_NEXT, STEP_NOT_WAITING, a run's
 *  409s) replaces it too and says why in a quiet notice; any other refusal
 *  shows inline. `answered` counts the answers, for the thread to move focus. */
export function useGuided(load: Load) {
  const bundle = load.bundle;
  const [pending, setPending] = useState<GuidedPending>(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState<EmailDraft>({ to: '', subject: '', body: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const busy = useRef(false);

  const take = useCallback(
    (next: Bundle) => {
      load.replace(next);
      setEditing(false);
      setFieldErrors({});
    },
    [load],
  );

  async function send(what: NonNullable<GuidedPending>, call: () => Promise<BundleAnswer>, fallback: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(what);
    setNotice(null);
    setError(null);
    try {
      const answer = await call();
      take(answer.bundle);
      feedChanged();
      taskChanged();
      setAnswered((n) => n + 1);
    } catch (err) {
      const read = readRunRefusal(err, fallback);
      if (read.lost) {
        load.lose();
        return;
      }
      const stepId = 'step' in what ? what.step : null;
      const mine = stepId !== null ? read.fields[stepId] : undefined;
      if (mine && Object.keys(mine).length > 0) {
        // The email's fields were refused: the editor stays open with each error under its field.
        setEditing(true);
        setFieldErrors(mine);
      } else if (read.bundle) {
        take(read.bundle);
        setNotice(read.form);
        setAnswered((n) => n + 1);
      } else setError(read.form ?? fallback);
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  const next = bundle ? nextStepOf(bundle) : null;
  // The answer bar: a waiting bundle with a step asked now, or one that may still be stopped.
  const showsBar = Boolean(bundle && bundle.status === 'waiting' && (next !== null || bundle.can_stop === true));

  const yes = () => {
    if (!bundle || !next) return;
    const fields = editing ? changedEmail(next, email) : {};
    void send({ what: 'run', step: next.id }, () => runStep(bundle.id, next.id, fields), GUIDED.RUN_FAILED);
  };
  const stop = () => {
    if (!bundle) return;
    void send({ what: 'stop' }, () => stopBundle(bundle.id), GUIDED.STOP_FAILED);
  };
  const retry = (stepId: number) => {
    if (!bundle) return;
    void send({ what: 'retry', step: stepId }, () => retryStep(bundle.id, stepId), GUIDED.RUN_FAILED);
  };
  const edit = (on: boolean) => {
    if (on && next) setEmail(emailDraftOf(next));
    setFieldErrors({});
    setEditing(on);
  };

  return { bundle, next, showsBar, pending, editing, email, setEmail, fieldErrors, notice, error, answered, yes, stop, retry, edit };
}

export type Guided = ReturnType<typeof useGuided>;

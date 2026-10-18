import { useId, useState } from 'react';
import { useAppDispatch } from '../../hooks';
import { fetchMailbox } from '../../features/mail/mailSlice';
import { apiFetch } from '../../lib/apiClient';
import { FORM_ALERT, Switch, TYPE } from '../ui';

/** The email agent's consent (owner decision A, 2026-10-17): off by default.
 *  On, it reads mail this person sends to colleagues, once, to suggest a
 *  task or a meeting that waits on them; internal mail is never kept. */
export function AgentConsent({ on: initial }: { on: boolean }) {
  const dispatch = useAppDispatch();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/mail/connection/', { method: 'PATCH', body: { agent_reads_mail: next } });
      setOn(next);
      void dispatch(fetchMailbox());
    } catch {
      setError("Couldn't change it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Switch checked={on} onChange={(next) => void change(next)} busy={busy} describedBy={noteId} className="self-start">
        Suggest tasks and meetings from what I send colleagues
      </Switch>
      <p id={noteId} className={TYPE.meta}>
        Mail between colleagues is never kept in Revenact. With this on, the agent reads what you send to colleagues once, and suggests a task or a meeting in your Work. Nobody else hears of it until you say yes.
      </p>
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

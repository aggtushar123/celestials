import { useState } from 'react';
import { Lock, Share2 } from 'lucide-react';
import { apiFetch } from '../../lib/apiClient';
import { BUTTON, FORM_ALERT, QUIET, TYPE } from '../ui';

/** Add to Revenact (owner decision, 2026-10-17): mail is the reader's own
 *  until they share the conversation on its customer; Remove takes it back. */
export function ShareToRevenact({ messageId, shared: initial, customerName }: { messageId: number; shared: boolean; customerName: string }) {
  const [shared, setShared] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/mail/messages/${messageId}/share/`, { method: next ? 'POST' : 'DELETE' });
      setShared(next);
    } catch (err) {
      const body = (err as { body?: { detail?: unknown } } | null)?.body;
      setError(typeof body?.detail === 'string' ? body.detail : "Couldn't change who reads this. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shared ? (
        <>
          <span className={`inline-flex items-center gap-1 ${TYPE.meta}`}>
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Shared on {customerName}: anyone who can open it reads this conversation.
          </span>
          <button type="button" onClick={() => void change(false)} aria-disabled={busy || undefined} className={QUIET}>
            Remove from Revenact
          </button>
        </>
      ) : (
        <>
          <span className={`inline-flex items-center gap-1 ${TYPE.meta}`}>
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            Only you can read this.
          </span>
          <button type="button" onClick={() => void change(true)} aria-disabled={busy || undefined} className={BUTTON}>
            Add to Revenact
          </button>
        </>
      )}
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

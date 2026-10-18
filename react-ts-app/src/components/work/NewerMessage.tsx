import { MailWarning } from 'lucide-react';
import { BUNDLE } from '../../features/agents/bundleText';
import { BUTTON, TYPE } from '../ui';

/** Spec §4.3, §8.2 (Decision 9): a newer message arrived after someone
 *  edited this bundle. Refresh suggestions asks the agent again; edited
 *  steps stay. Bordered, never the primary: Run stays the one primary.
 *  Only the sentence is the status, not the button beside it. On a phone
 *  the button drops under the sentence; from sm they sit side by side. */
export function NewerMessage({ canRefresh, busy, onRefresh }: { canRefresh: boolean; busy: boolean; onRefresh: () => void }) {
  return (
    <div data-testid="newer-message" className="flex flex-col gap-3 rounded-lg border border-line px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <p role="status" className={`${TYPE.body} min-w-0 flex-1`}>
          {BUNDLE.NEWER}
        </p>
      </div>
      {canRefresh ? (
        <button type="button" onClick={onRefresh} aria-disabled={busy || undefined} className={`${BUTTON} self-start sm:self-auto`}>
          {busy ? BUNDLE.REFRESHING : BUNDLE.REFRESH}
        </button>
      ) : null}
    </div>
  );
}

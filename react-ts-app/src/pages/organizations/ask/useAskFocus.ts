import { useContext, useEffect } from 'react';
import type { AskFocus } from '../../copilot/types';
import { AskFocusOnContext } from '../../dashboard/ask/context';

/** Just `focusOn`, read from its own context so a caller that only narrows
 *  the next question (never reads the conversation, the thread or the open
 *  state) doesn't re-render whenever a send changes the shared `AskState`.
 *  Null outside an Ask provider, as `useAsk()` is. */
export function useAskFocusOn(): ((focus: AskFocus) => void) | null {
  return useContext(AskFocusOnContext);
}

/** Opening an account (a List row, a Board card's side panel or sheet)
 *  narrows the next question to it (spec §3), as a dashboard drill does: for
 *  one question, dropped by the send, the chip's × or a filter change.
 *  Closing the account keeps it; opening another replaces it. Nothing
 *  happens outside an Ask provider. Reads only the stable `focusOn`, so a
 *  send (pending, then the answer) never re-renders the List or the Board
 *  through this hook. */
export function useAskFocusOnOpen(openId: number | null): void {
  const focusOn = useAskFocusOn();
  useEffect(() => {
    if (openId !== null) focusOn?.({ kind: 'companies', ids: [openId] });
  }, [openId, focusOn]);
}

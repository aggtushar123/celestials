// The composer's hold on its DraftSession (Decision 4): one session per
// mount (the composer is keyed by its target), started on mount and saved
// on unmount; a send still pending is read again each minute, as the agent
// draft panel does.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { DraftSession, type ComposeTarget, type SessionState } from './draftSession';

export const SENDING_POLL_MS = 60_000;

export function useDraftSession(target: ComposeTarget, autosaveMs?: number, savingPollMs?: number): [SessionState, DraftSession] {
  const [session] = useState(() => new DraftSession(target, autosaveMs, savingPollMs));
  const state = useSyncExternalStore(session.subscribe, session.getState);
  useEffect(() => {
    void session.start();
    return () => session.dispose();
  }, [session]);
  const pending = state.draft?.sending === 'pending';
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void session.reread(), SENDING_POLL_MS);
    return () => clearInterval(timer);
  }, [pending, session]);
  return [state, session];
}

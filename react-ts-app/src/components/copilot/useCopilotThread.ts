import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { VIEW_CHANGED } from '../../features/brain/askContext';
import { sendMessage } from '../../pages/copilot/copilotApi';
import type { Conversation, SurfaceContext } from '../../pages/copilot/types';

/** One question: what the bubble shows (`text`), what is sent (`content`,
 *  which carries Communications' prefix), and the Dashboard's or
 *  Organizations' structured context. */
export interface Turn {
  text: string;
  content: string;
  context?: SurfaceContext;
}

export interface FailedTurn extends Turn {
  /** A 429: the month's AI budget is spent, so there is nothing to retry. */
  budget: boolean;
  /** A 400 refusing the page itself (an organisation or account the asker
   *  may no longer open): asking again would ask the same, so no retry. */
  refused: boolean;
  message: string;
}

export interface CopilotThread {
  pending: Turn | null;
  failed: FailedTurn | null;
  send: (turn: Turn) => Promise<void>;
  retry: () => void;
}

export const BUDGET_MESSAGE = "This month's AI budget is used up.";

/** What a `400 {"context": {…}}` means to the asker: the page, or the item
 *  asked about, is no longer theirs to ask about. `context` is the question's
 *  own, so a key can read per surface: an Accounts `account` is the page
 *  itself, an organisation page's `account` is its account chip, and
 *  Pipelines' `focus` names the item's kind. A Brain one's `scope` is the
 *  view the page asked in. Null for any other failure. */
export function refusalMessage(err: unknown, context?: SurfaceContext | null): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const body = (err.body as { context?: unknown } | null)?.context;
  if (!body || typeof body !== 'object') return null;
  if (context?.surface === 'brain') {
    // The scope the page asked in is no longer the asker's; asking again
    // asks the view the page has moved to.
    return 'scope' in body ? VIEW_CHANGED : null;
  }
  if (context?.surface === 'pipelines') {
    // The item "Ask about this" was pressed on. A filter refusal falls
    // through to the shared list copy below.
    if ('focus' in body) return `You can no longer ask about this ${context.focus?.kind ?? 'item'}.`;
  }
  if (context?.surface === 'accounts') {
    if ('account' in body) return 'You can no longer ask about this account.';
    if ('focus' in body) return 'You can no longer ask about this item. Ask about the account instead.';
    if ('filters' in body) return "You can't ask about this list. Clear the filters and ask again.";
    return null;
  }
  if ('contact' in body) return "You can't ask about this person here.";
  if ('filters' in body) return "You can't ask about this list. Clear the filters and ask again.";
  if ('organization' in body) return 'You can no longer ask about this organization.';
  if ('account' in body) return 'You can no longer ask about this account. Choose All and ask again.';
  return null;
}

/** Sending on one conversation, with the states the rail shows: in flight,
 *  budget spent, or failed and retryable with the question kept. */
export function useCopilotThread(
  conversation: Conversation | null,
  onConversation: (conversation: Conversation) => void,
  context?: SurfaceContext | null,
): CopilotThread {
  const [pending, setPending] = useState<Turn | null>(null);
  const [failed, setFailed] = useState<FailedTurn | null>(null);

  // Another conversation (New chat, one reopened from History) starts clean.
  // Adjusted during render, as DrillContext does, so no frame shows the old failure.
  const id = conversation?.id ?? null;
  const [threadId, setThreadId] = useState(id);
  if (threadId !== id) {
    setThreadId(id);
    setFailed(null);
    setPending(null);
  }

  // Moving to another organisation or account keeps the same conversation
  // (spec: it lasts from the List into an organisation and back), but a
  // refusal there says nothing about the page the person has moved to, so it
  // does not linger once the context has changed. Only a refusal: a failure
  // worth retrying keeps its question and Retry across a filter change (Retry
  // asks as it was asked, chip included), and the month's budget is spent on
  // every page. `context` is undefined for a caller with nothing structured
  // to ask about (Communications), which never triggers this.
  const contextKey = context ? JSON.stringify(context) : null;
  const [threadContext, setThreadContext] = useState(contextKey);
  if (threadContext !== contextKey) {
    setThreadContext(contextKey);
    if (failed?.refused) setFailed(null);
  }
  // The context on screen now, for a refusal that lands after the person
  // moved on: it is about the page it was asked on, so it is dropped as the
  // change above would have dropped it.
  const liveContext = useRef(contextKey);
  useEffect(() => {
    liveContext.current = contextKey;
  }, [contextKey]);

  // Which conversation is on screen now, for a send that outlives it: an
  // answer that lands after New chat or a History pick belongs to the
  // conversation it was asked in, not the one the person moved to.
  const liveId = useRef(id);
  useEffect(() => {
    liveId.current = id;
  }, [id]);
  // The latest send, so an earlier one finishing late can't clear its pending.
  const latest = useRef(0);

  // A Brain scope refusal (VIEW_CHANGED) names the view itself as no longer
  // the asker's; the page's own read has not yet caught up when it lands, so
  // asking again right away would ask the same refused view and refuse
  // again. Block a resend until the context actually changes — which clears
  // the refusal above, via `threadContext`. Scoped to the Brain: every other
  // surface's refusal keeps resending as it already did.
  const refusedOn = useRef<string | null>(null);

  async function send(turn: Turn) {
    if (pending) return;
    if (failed?.refused && turn.context?.surface === 'brain' && contextKey === refusedOn.current) return;
    const askedIn = conversation?.id ?? null;
    const askedOn = liveContext.current;
    const mine = ++latest.current;
    const stillHere = () => liveId.current === askedIn;
    setFailed(null);
    setPending(turn);
    try {
      const answered = await sendMessage({ conversationId: conversation?.id, content: turn.content, context: turn.context });
      if (stillHere()) onConversation(answered);
    } catch (err) {
      if (!stillHere()) return;
      const budget = err instanceof ApiError && err.status === 429;
      const refusal = refusalMessage(err, turn.context);
      if (refusal !== null && liveContext.current !== askedOn) return;
      const message = budget
        ? BUDGET_MESSAGE
        : (refusal ?? (err instanceof ApiError ? err.message : 'The Copilot did not answer.'));
      setFailed({ ...turn, budget, refused: refusal !== null, message });
      if (refusal !== null && turn.context?.surface === 'brain') refusedOn.current = askedOn;
    } finally {
      if (latest.current === mine) setPending(null);
    }
  }

  // Retry resends the question as it was asked, context included (the chip
  // on the failed bubble), not the screen as it is now.
  function retry() {
    if (!failed || failed.budget || failed.refused) return;
    void send({ text: failed.text, content: failed.content, context: failed.context });
  }

  return { pending, failed, send, retry };
}

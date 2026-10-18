import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCopilotThread, type CopilotThread } from '../../../components/copilot/useCopilotThread';
import { SM, XL, useMediaQuery } from '../../../lib/useMediaQuery';
import { fetchConversation } from '../../copilot/copilotApi';
import type { AskFocus, Conversation } from '../../copilot/types';
import { ASK_PREFERENCE_KEY, readAskPreference, writeAskPreference } from './askPreference';
import { AskContext, AskDraftContext, AskFocusOnContext, withFocus, type AskState, type AskSurface, type PendingDraft } from './context';
import { originPath } from './originPath';

/** The navigation state another surface's History sends with a conversation
 *  that started on this page: the conversation History already loaded, and
 *  its id, for when only the id survives (the page fetches it then). */
export interface AskHandover {
  askConversationId?: number;
  askConversation?: Conversation;
}

/** Holds one surface's conversation (the Dashboard's above its areas,
 *  Organizations' above the List and the Board), so it survives tab and
 *  filter changes. Also the rail's open state, the focus an entry point hands
 *  it, and the question a drill prefills. `surface` is where the person is on
 *  that page and how its chips read; `preferenceKey` is where the rail's own
 *  open/closed choice is kept. */
export function AskProvider({
  surface,
  preferenceKey = ASK_PREFERENCE_KEY,
  children,
}: {
  surface: AskSurface;
  preferenceKey?: string;
  children: ReactNode;
}) {
  const { pathname, search, hash, state } = useLocation();
  const navigate = useNavigate();
  const isSm = useMediaQuery(SM);
  const isXl = useMediaQuery(XL);
  // Read once, on arrival: a conversation another surface's History sent here.
  const [handover] = useState(() => (state as AskHandover | null) ?? null);
  const [arrivedAt] = useState(pathname + search + hash);
  const handedId = handover?.askConversationId ?? handover?.askConversation?.id ?? null;
  const [conversation, setShownConversation] = useState<Conversation | null>(() => handover?.askConversation ?? null);
  // Flipped once the person moves on (a send, New chat, a History pick), so a
  // slow handover fetch landing late never replaces what they are in now.
  const movedOn = useRef(false);
  const setConversation = useCallback((next: Conversation | null) => {
    movedOn.current = true;
    setShownConversation(next);
  }, []);
  const rawThread = useCopilotThread(conversation, setConversation, surface.context);
  const thread = useMemo<CopilotThread>(
    () => ({
      ...rawThread,
      send: (turn) => {
        movedOn.current = true;
        return rawThread.send(turn);
      },
    }),
    [rawThread],
  );
  // A handed-over conversation shows for this visit, whatever the saved choice.
  const [choice, setChoice] = useState<boolean | null>(() => (handedId !== null ? true : readAskPreference(preferenceKey)));
  const [sheetOpen, setSheetOpen] = useState(handedId !== null);
  const [focus, setFocus] = useState<AskFocus | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);

  // The handover is spent once read: clear it from the history entry, so a
  // reload or Back and Forward neither refetches it nor forces the rail
  // open. Only a real handover (an id or a conversation) is ours to clear:
  // navigation state from anywhere else is not this provider's to erase.
  const cleared = useRef(false);
  useEffect(() => {
    if (!handover || cleared.current || handedId === null) return;
    cleared.current = true;
    navigate(arrivedAt, { replace: true, state: null });
  }, [handover, handedId, arrivedAt, navigate]);

  useEffect(() => {
    // Only an id came (History's copy was lost): fetch it.
    if (handedId === null || handover?.askConversation) return;
    let cancelled = false;
    fetchConversation(handedId).then(
      (found) => {
        if (!cancelled && !movedOn.current) setShownConversation(found);
      },
      () => {
        // The rail opens empty; History still lists the conversation.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [handedId, handover]);

  // A focus names accounts on the screen it came from, so another area or
  // filter drops it (a drill closes on the same change). Adjusted during
  // render, as DrillContext does. The prefilled question goes with it while
  // untouched ("What should I know about this call?" names the item that is
  // no longer the focus); once edited it is the person's text, and stays.
  const locationKey = pathname + search;
  const [madeAt, setMadeAt] = useState(locationKey);
  if (madeAt !== locationKey) {
    setMadeAt(locationKey);
    setFocus(null);
    if (pendingDraft && !pendingDraft.edited) setPendingDraft(null);
  }

  // Open by default from xl; the person's own choice wins once made. Below
  // sm the rail is a sheet, which always starts closed (unless a
  // conversation was handed over).
  const railOpen = choice ?? isXl;
  const open = isSm ? railOpen : sheetOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (isSm) {
        setChoice(next);
        writeAskPreference(next, preferenceKey);
      } else {
        setSheetOpen(next);
      }
    },
    [isSm, preferenceKey],
  );

  // Entry points (a drill's "Ask about these", an attention row's "Why?",
  // New chat, a History pick) open the rail for this visit only; the saved choice is the person's own
  // toggle, so one click never overwrites a remembered "collapsed".
  const reveal = useCallback(() => {
    if (isSm) setChoice(true);
    else setSheetOpen(true);
  }, [isSm]);

  const clearFocus = useCallback(() => setFocus(null), []);
  const focusOn = useCallback((next: AskFocus) => setFocus(next), []);
  const markSent = useCallback(() => {
    setFocus(null);
    setPendingDraft(null);
  }, []);
  const markDraftEdited = useCallback(() => {
    setPendingDraft((prev) => (prev && !prev.edited ? { ...prev, edited: true } : prev));
  }, []);
  const draft = useCallback(
    (question: string, nextFocus: AskFocus) => {
      setFocus(nextFocus);
      // A new nonce remounts the composer with the new text. After markSent
      // the key is 0, so restarting at 1 still differs from the last key.
      setPendingDraft((prev) => ({ text: question, nonce: (prev?.nonce ?? 0) + 1 }));
      reveal();
    },
    [reveal],
  );

  const value = useMemo<AskState>(
    () => ({
      surface,
      open,
      setOpen,
      conversation,
      setConversation,
      thread,
      focus,
      clearFocus,
      focusOn,
      markSent,
      pendingDraft,
      markDraftEdited,
      draft,
      ask: (question, nextFocus) => {
        // One question at a time: while an answer is on its way the thread
        // would drop this send, so leave the draft and its focus as they are.
        const context = surface.context;
        if (!context || thread.pending) return;
        // A context from another surface would ground the answer in the
        // wrong page: never send it.
        if (context.surface !== surface.name) {
          if (import.meta.env.DEV) console.warn(`Ask: a ${context.surface} context on the ${surface.name} surface was not sent.`);
          return;
        }
        reveal();
        void thread.send({ text: question, content: question, context: withFocus(context, nextFocus) });
        // The send above carries its own focus; an earlier draft's focus and
        // text are spent, or the chip would name accounts nobody asked about.
        setFocus(null);
        setPendingDraft(null);
      },
      newChat: () => {
        setConversation(null);
        reveal();
      },
      openFromHistory: (next) => {
        const origin = next.origin;
        if (origin && origin.surface !== surface.name) {
          // Started on the other surface: it reopens on that page, beside
          // what it was about, and that page's rail picks it up.
          const handover: AskHandover = { askConversationId: next.id, askConversation: next };
          navigate(originPath(origin), { state: handover });
          return;
        }
        // One from this surface reopens where it was asked, so its first
        // answer sits beside the figures it was about.
        if (origin) navigate(originPath(origin));
        setConversation(next);
        reveal();
      },
    }),
    [surface, open, setOpen, reveal, conversation, setConversation, thread, focus, clearFocus, focusOn, markSent, pendingDraft, markDraftEdited, draft, navigate],
  );

  return (
    <AskContext.Provider value={value}>
      <AskFocusOnContext.Provider value={focusOn}>
        <AskDraftContext.Provider value={draft}>{children}</AskDraftContext.Provider>
      </AskFocusOnContext.Provider>
    </AskContext.Provider>
  );
}

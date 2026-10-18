import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HomeView } from './HomeView';
import { ChatView } from './ChatView';
import { CopilotSidebar } from './CopilotSidebar';
import { CockpitView } from './CockpitView';
import { fetchConversation, fetchConversations, sendMessage } from './copilotApi';
import { ApiError } from '../../lib/apiClient';
import { useAppDispatch, useAppSelector } from '../../hooks';
import {
  fetchSession,
  makeSessionLive,
  handOffSession,
  fetchSessionDecisions,
  captureSessionDecisions,
  closeSession,
  fetchMyInvites,
  respondToInvite,
} from '../../features/copilotSessions/sessionApi';
import type { Proposal } from '../../features/proposals/proposalsSlice';
import type { AskSuggestion } from './types';
import { askQuestion } from '../../features/knowledge/knowledgeSlice';
import { connectSessionSocket } from '../../features/copilotSessions/sessionSocket';
import {
  sessionSnapshotReceived,
  sessionPushReceived,
  myInvitesReceived,
  inviteRemoved,
} from '../../features/copilotSessions/copilotSessionsSlice';
import type { ConversationSummary, CopilotMessage } from './types';

// Phase 2b's own real-time push (see sessionSocket.ts) is the primary
// sync mechanism now — this poll is a slow resilience fallback in case
// a socket silently drops (a laptop sleeping through a network change,
// etc.) rather than the whole feature's own correctness depending on a
// socket connection never failing.
const SESSION_POLL_INTERVAL_MS = 20000;
const INVITES_POLL_INTERVAL_MS = 8000;

export function CopilotIndex() {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((state) => state.auth.user);
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const sessions = useAppSelector((state) => state.copilotSessions.byId);
  const myInvites = useAppSelector((state) => state.copilotSessions.myInvites);
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<'home' | 'chat' | 'empty-chat'>('home');
  const [activeTab, setActiveTab] = useState<'copilot' | 'cockpit'>('copilot');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  // Mirrors activeConversationId for handleSelectChat's own fetch chain
  // below — a ref, not the state itself, since a `.then` far downstream
  // needs the *current* id at the moment it resolves, not the id it
  // closed over when the fetch started (SOC2:AUTH-02: a slower, earlier
  // conversation's GET landing after the switch must never overwrite
  // the one now on screen).
  const activeConversationIdRef = useRef<number | null>(null);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Proposal[]>([]);
  // SOC2:AUTH-02 — decisions about a record this reader can't open:
  // counted, never named. Accumulated the same way `decisions` itself
  // is: replaced on the GET that loads a conversation fresh, added to by
  // every later capture (including a close that captures).
  const [decisionsHidden, setDecisionsHidden] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [visibility, setVisibility] = useState<'full' | 'partial'>('full');
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Set by the "Ask Copilot" entry point on the Organization/Account
  // Details pages (see Details.tsx's own button) — the real account
  // this conversation is about, kept around (not cleared on send) until
  // a real CopilotSession actually exists for it (see handleMakeLive) —
  // Phase 2a creates that row server-side only once the owner explicitly
  // opts in, not automatically on the first message (see SessionView's
  // own docstring on the backend).
  const [pendingAccountContext, setPendingAccountContext] = useState<{
    customerId?: number;
    accountId?: number;
    accountName: string;
  } | null>(null);

  const activeSession = activeConversationId ? sessions[activeConversationId] : null;


  useEffect(() => {
    fetchConversations()
      .then(setConversations)
      .catch(() => {
        // The sidebar's own "no chats yet" empty state covers a failed
        // load the same as a genuinely empty list — nothing to start a
        // conversation from is not itself worth a blocking error banner.
      });
  }, []);

  // Real cross-user sync, Phase 2b — a real WebSocket push
  // (sessionSocket.ts) as the primary mechanism for an open
  // live/awaiting-handoff session (a private or closed session has
  // nothing new to sync). Each push (or slow-poll fallback tick, below)
  // also re-fetches the conversation's own messages, since another
  // real participant's redirect shows up as both a new SessionEvent and
  // a new Message at once.
  useEffect(() => {
    if (!activeConversationId) return;
    const pollable = activeSession?.status === 'live' || activeSession?.status === 'awaiting_handoff';
    if (!pollable || !accessToken) return;

    const refreshMessages = () => {
      fetchConversation(activeConversationId)
        .then((conversation) => {
          setMessages(conversation.messages);
          setVisibility(conversation.visibility ?? 'full');
        })
        .catch(() => {});
    };

    // Paused while the person is away (lib/presence.ts); on return, catch
    // up on the session and its messages before the next push.
    const socket = connectSessionSocket(
      activeConversationId,
      accessToken,
      (session) => {
        dispatch(sessionPushReceived(session));
        refreshMessages();
      },
      {
        onResume: () => {
          fetchSession(activeConversationId)
            .then((session) => dispatch(sessionSnapshotReceived(session)))
            .catch(() => {});
          refreshMessages();
        },
      }
    );

    // Resilience fallback only — real sync is the socket above. Runs
    // much slower than Phase 2a's own tight poll did, since it's not
    // the primary path anymore; catches up within its own cycle if a
    // socket ever silently drops without the reconnect logic noticing.
    const intervalId = window.setInterval(() => {
      fetchSession(activeConversationId)
        .then((session) => dispatch(sessionSnapshotReceived(session)))
        .catch(() => {});
      refreshMessages();
    }, SESSION_POLL_INTERVAL_MS);

    return () => {
      socket.disconnect();
      window.clearInterval(intervalId);
    };
  }, [activeConversationId, activeSession?.status, accessToken, dispatch]);

  // Real invites, Phase 2a — polled independent of whatever conversation
  // is open, since an invite needs to be visible before the invitee can
  // even load the conversation it's for (see MyInvitesView's own
  // docstring on the backend).
  useEffect(() => {
    const poll = () => {
      fetchMyInvites()
        .then((invites) => dispatch(myInvitesReceived(invites)))
        .catch(() => {});
    };
    poll();
    const intervalId = window.setInterval(poll, INVITES_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [dispatch]);

  // Loads a real conversation this user already has access to (owner,
  // or an accepted+active session participant — see
  // conversations_visible_to on the backend) — shared by the shareable-
  // link flow (query param, below) and clicking a session from the
  // sidebar. A 404 here means no real access, not a bug — surfaced as a
  // real error rather than silently showing an empty chat.
  function openSession(conversationId: number) {
    setActiveConversationId(conversationId);
    setView('chat');
    setMessages([]);
    setSendError(null);
    fetchConversation(conversationId)
      .then((conversation) => {
        setMessages(conversation.messages);
        setVisibility(conversation.visibility ?? 'full');
      })
      .catch((err) =>
        setSendError(
          err instanceof ApiError && err.status === 404
            ? "You don't have access to this session — ask the owner to invite you."
            : 'Could not load this session.'
        )
      );
    fetchSession(conversationId)
      .then((session) => dispatch(sessionSnapshotReceived(session)))
      .catch(() => {
        // No session yet (or no access) — the conversation-level fetch
        // above already surfaces a real access error when that's why;
        // "no session exists" on its own isn't an error.
      });
  }

  // One-time read of the entry-point/shareable-link query params.
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    const forCustomerId = searchParams.get('forCustomerId');
    const forAccountId = searchParams.get('forAccountId');
    const forCustomerName = searchParams.get('forCustomerName');

    if (sessionParam) {
      openSession(Number(sessionParam));
    } else if (forCustomerId || forAccountId) {
      setPendingAccountContext({
        customerId: forCustomerId ? Number(forCustomerId) : undefined,
        accountId: forAccountId ? Number(forAccountId) : undefined,
        accountName: forCustomerName ?? 'this account',
      });
      setView('empty-chat');
    }
    setSearchParams({}, { replace: true });
    // Only ever meant to run once, against whatever query params the page
    // was actually opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSendPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || isSending) return;

    setView('chat');
    setSendError(null);
    setIsSending(true);
    // Optimistic bubble — replaced wholesale by the server's own real
    // messages (including its own id) once the send resolves.
    const optimisticId = -Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: 'user',
        content: trimmed,
        sources: [], questions: [],
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      const conversation = await sendMessage({
        conversationId: activeConversationId ?? undefined,
        content: trimmed,
      });
      setActiveConversationId(conversation.id);
      setMessages(conversation.messages);
      setVisibility(conversation.visibility ?? 'full');
      setConversations((prev) => {
        const withoutThisOne = prev.filter((c) => c.id !== conversation.id);
        return [
          { id: conversation.id, title: conversation.title, created_at: conversation.created_at, updated_at: conversation.updated_at },
          ...withoutThisOne,
        ];
      });

      // A message into a conversation that already has a real session
      // is, by definition, a real redirect (see SendMessageView's own
      // docstring) — the backend already logged it; pull the fresh
      // snapshot now rather than waiting for the next poll tick.
      if (activeSession) {
        fetchSession(conversation.id)
          .then((session) => dispatch(sessionSnapshotReceived(session)))
          .catch(() => {});
      }
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Could not reach Copilot.');
    } finally {
      setIsSending(false);
    }
  }

  function handleSelectSkill(skill: string | null) {
    setSelectedSkill(skill);
    if (skill) {
      setView('home');
    }
  }

  async function handleSelectChat(conversationId: number) {
    setView('chat');
    setActiveConversationId(conversationId);
    setSendError(null);
    setMessages([]);
    // Reset before either GET below settles — a previous conversation's
    // decisions/hidden count must never still be on screen because this
    // one's own GET came back late or failed (SOC2:AUTH-02: the count is
    // sensitive enough that stale is as wrong as wrong).
    setDecisions([]);
    setDecisionsHidden(0);
    try {
      const conversation = await fetchConversation(conversationId);
      setMessages(conversation.messages);
      setVisibility(conversation.visibility ?? 'full');
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Could not load this conversation.');
    }
    fetchSession(conversationId)
      .then((session) => {
        // Stale by the time this resolved — the user has since switched
        // to a different conversation. Applying it now would overwrite
        // that conversation's own, already-correct decisions/hidden
        // count with this one's.
        if (activeConversationIdRef.current !== conversationId) return;
        dispatch(sessionSnapshotReceived(session));
        return fetchSessionDecisions(conversationId).then((r) => {
          if (activeConversationIdRef.current !== conversationId) return;
          setDecisions(r.proposals);
          setDecisionsHidden(r.hidden);
        });
      })
      .catch(() => {
        // No session for this conversation — nothing to show, not an error.
      });
  }

  function handleNewChat() {
    setView('empty-chat');
    setSelectedSkill(null);
    setActiveConversationId(null);
    setPendingAccountContext(null);
    setMessages([]);
    setSendError(null);
    setIsSending(false);
    setDecisions([]);
    setDecisionsHidden(0);
    setCaptureError(null);
    setVisibility('full');
  }

  async function handleCaptureDecisions() {
    if (!activeConversationId) return;
    setIsCapturing(true);
    setCaptureError(null);
    try {
      const { proposals, hidden } = await captureSessionDecisions(activeConversationId);
      setDecisions((prev) => [...prev, ...proposals]);
      setDecisionsHidden((prev) => prev + hidden);
      // Decisions were captured even when every one of them is hidden
      // from this reader (SOC2:AUTH-02) — that's not "nothing decided".
      if (proposals.length === 0 && hidden === 0) setCaptureError('Nothing was decided in this session yet.');
    } catch (err) {
      setCaptureError(err instanceof ApiError ? err.message : 'Could not capture the decisions.');
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleCloseSession(captureDecisions: boolean) {
    if (!activeConversationId) return;
    setIsClosing(true);
    setCaptureError(null);
    try {
      const { decisions, decisions_error, decisions_hidden, ...session } = await closeSession(activeConversationId, captureDecisions);
      dispatch(sessionSnapshotReceived(session));
      if (decisions?.length) setDecisions((prev) => [...prev, ...decisions]);
      if (decisions_hidden) setDecisionsHidden((prev) => prev + decisions_hidden);
      if (captureDecisions && decisions_error) setCaptureError(decisions_error);
      // Decisions were captured even when every one of them is hidden
      // from this reader (SOC2:AUTH-02) — show only the hidden line, not
      // "nothing was decided".
      else if (captureDecisions && !decisions?.length && !decisions_hidden) setCaptureError('Nothing was decided in this session.');
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Could not close this session.');
    } finally {
      setIsClosing(false);
    }
  }

  async function handleAskSuggested(userTurnId: number, suggestion: AskSuggestion) {
    const userTurn = messages.find((m) => m.id === userTurnId);
    if (!userTurn) return;
    const result = await dispatch(
      askQuestion({ customerId: suggestion.customer_id, text: userTurn.content, assignee_id: suggestion.user_id, message_id: userTurnId })
    );
    if (askQuestion.fulfilled.match(result)) {
      const asked = result.payload.rows.map((q) => ({ id: q.id, assignee: q.assignee, status: q.status }));
      setMessages((prev) => prev.map((m) => (m.id === userTurnId ? { ...m, questions: [...m.questions, ...asked] } : m)));
    } else {
      setSendError(result.payload ?? 'Could not ask that.');
    }
  }

  async function handleMakeLive() {
    if (!activeConversationId) return;
    try {
      const session = await makeSessionLive(activeConversationId, pendingAccountContext ?? undefined);
      dispatch(sessionSnapshotReceived(session));
      setPendingAccountContext(null);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Could not make this session live.');
    }
  }

  async function handleHandOff(toUserId: number, toUserName: string, note: string) {
    if (!activeConversationId) return;
    try {
      const session = await handOffSession(
        activeConversationId,
        toUserId,
        note,
        pendingAccountContext ?? undefined
      );
      dispatch(sessionSnapshotReceived(session));
      setPendingAccountContext(null);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : `Could not hand off to ${toUserName}.`);
    }
  }

  function handleAcceptInvite(inviteId: number, conversationId: number) {
    respondToInvite(inviteId, 'accepted')
      .then(() => {
        dispatch(inviteRemoved({ inviteId }));
        openSession(conversationId);
      })
      .catch(() => {
        // A failed accept just leaves the invite showing — the user can
        // retry the same click.
      });
  }

  function handleDeclineInvite(inviteId: number) {
    respondToInvite(inviteId, 'declined')
      .then(() => dispatch(inviteRemoved({ inviteId })))
      .catch(() => {});
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* The view switch. Small and out of the way: this is the home page,
          and the only chrome it needs is where else it can go. */}
      <div className="h-11 flex items-center justify-end px-5 shrink-0">
        <div role="tablist" aria-label="Copilot views" className="inline-flex items-center gap-1 rounded-full border border-line bg-surface/70 p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'copilot'}
            onClick={() => {
              setActiveTab('copilot');
              setView('home');
            }}
            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors duration-[var(--dur-fast)] ${activeTab === 'copilot' ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink'}`}
          >
            Copilot
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cockpit'}
            onClick={() => setActiveTab('cockpit')}
            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors duration-[var(--dur-fast)] ${activeTab === 'cockpit' ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink'}`}
          >
            Cockpit
          </button>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 flex relative overflow-hidden">
        {activeTab === 'copilot' ? (
          <>
            <CopilotSidebar
              isExpanded={isSidebarExpanded}
              setIsExpanded={setIsSidebarExpanded}
              conversations={conversations}
              activeConversationId={activeConversationId}
              sessions={sessions}
              myInvites={myInvites}
              onNewChat={handleNewChat}
              onSelectChat={handleSelectChat}
              onSelectSkill={handleSelectSkill}
              onAcceptInvite={handleAcceptInvite}
              onDeclineInvite={handleDeclineInvite}
            />
            {/* Home and chat share the canvas: no card around either. */}
            <div className="flex-1 overflow-hidden relative flex">
              {view === 'home' ? (
                <HomeView onSendPrompt={handleSendPrompt} selectedSkill={selectedSkill} onSelectSkill={handleSelectSkill} />
              ) : (
                <ChatView
                  onSendPrompt={handleSendPrompt}
                  isEmpty={view === 'empty-chat'}
                  messages={messages}
                  isSending={isSending}
                  sendError={sendError}
                  pendingAccountName={pendingAccountContext?.accountName ?? null}
                  session={activeSession ?? null}
                  currentUserId={currentUser?.id ?? null}
                  onMakeLive={handleMakeLive}
                  onHandOff={handleHandOff}
                  decisions={decisions}
                  decisionsHidden={decisionsHidden}
                  onCaptureDecisions={handleCaptureDecisions}
                  isCapturing={isCapturing}
                  captureError={captureError}
                  onCloseSession={handleCloseSession}
                  isClosing={isClosing}
                  onAskSuggested={handleAskSuggested}
                  visibility={visibility}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden p-6 pt-2">
            <CockpitView />
          </div>
        )}
      </div>
    </div>
  );
}

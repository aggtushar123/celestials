// Multiplayer Copilot, Phase 2a — mirrors revenact-backend's real
// CopilotSession/SessionEvent/SessionInvite (services/copilot/models.py,
// serializers.py) field for field, the same way features/customers/
// customersSlice.ts mirrors CustomerSerializer. Real cross-user sessions,
// invite-only access — see revenact-backend's docs/API_CONTRACTS.md for
// the full contract. Superseded from M0's own entirely-local,
// BroadcastChannel-synced version (see git history) now that a real
// backend exists to be the shared source of truth two *different* real
// logins can both see.
//
// Keyed by `conversationId` everywhere in this app (not a synthetic
// client-generated id — CopilotSession is a real OneToOne on Conversation
// backend-side) — simpler than M0's own `crypto.randomUUID()`, which only
// existed because there was no real backend id to use yet.

export interface Actor {
  id: number;
  name: string;
}

export type SessionStatus = 'private' | 'live' | 'awaiting_handoff' | 'closed';

export interface SessionEvent {
  id: number;
  kind: 'joined' | 'left' | 'redirected' | 'handed_off' | 'made_live' | 'closed';
  actor: Actor | null;
  /** Set only for kind='redirected' — which real Message this event
   * tags. Only a reference: the text itself is read from the
   * conversation, never from the event. */
  message: { id: number; role: 'user' | 'assistant'; created_at: string } | null;
  /** kind='handed_off': {to_user_id, to_user_name, note}. `note` is null
   * for a viewer who may not see it, and always null in a WebSocket
   * push. Empty object for every other kind. */
  payload: Record<string, unknown>;
  created_at: string;
}

export interface SessionParticipant {
  user: Actor;
  joined_at: string;
  left_at: string | null;
}

export interface CopilotSession {
  id: number;
  conversation_id: number;
  owner: Actor;
  customer_id: number | null;
  /** Null for a viewer who may not see the customer, and always null in
   * a WebSocket push (only the REST poll carries it). */
  customer_name: string | null;
  account_id: number | null;
  /** Same rule as customer_name. */
  account_name: string | null;
  status: SessionStatus;
  /** Currently present only (left_at null) — see the backend
   * serializer's own docstring. */
  participants: SessionParticipant[];
  /** Every event so far, or only those since `?since_id=` when fetched
   * that way (see sessionApi.ts's own fetchSessionEvents). */
  events: SessionEvent[];
  created_at: string;
  closed_at: string | null;
}

export interface SessionInvite {
  id: number;
  status: 'pending' | 'accepted' | 'declined';
  invited_by: Actor | null;
  conversation_id: number;
  conversation_title: string;
  /** The real company this session is about, if any — see the backend
   * serializer's own get_account_label. */
  account_label: string | null;
  created_at: string;
}

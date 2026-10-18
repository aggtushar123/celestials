import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CopilotSession, SessionInvite } from './types';

// Multiplayer Copilot, Phase 2a — real backend-shaped state now (see
// types.ts's own docstring), populated from sessionApi.ts's real REST
// responses via a polling loop (see pages/copilot/Index.tsx's own
// useSessionPolling), not M0's BroadcastChannel/localStorage layer,
// which this supersedes entirely (no more `sessionsHydrated` — a fresh
// page load just re-fetches from the real backend instead of reading
// localStorage).

interface CopilotSessionsState {
  byId: Record<number, CopilotSession>;
  myInvites: SessionInvite[];
}

const initialState: CopilotSessionsState = {
  byId: {},
  myInvites: [],
};

export const copilotSessionsSlice = createSlice({
  name: 'copilotSessions',
  initialState,
  reducers: {
    // A REST response: a full GET (every event) or a POST response
    // (make-live/handoff/close, each returning its own full history).
    // Authoritative for this viewer, so its names and notes replace
    // what is held, including a null an earlier push left on an event
    // (same id: the poll's copy wins). Events merge rather than replace
    // so an older event held locally is never dropped.
    sessionSnapshotReceived: (state, action: PayloadAction<CopilotSession>) => {
      const incoming = action.payload;
      const existing = state.byId[incoming.conversation_id];
      const incomingById = new Map(incoming.events.map((e) => [e.id, e]));
      const existingIds = new Set(existing?.events.map((e) => e.id) ?? []);
      const events = existing
        ? [
            ...existing.events.map((e) => incomingById.get(e.id) ?? e),
            ...incoming.events.filter((e) => !existingIds.has(e.id)),
          ]
        : incoming.events;
      state.byId[incoming.conversation_id] = { ...incoming, events };
    },

    // A WebSocket push. The broadcast goes to every viewer at once, so
    // the backend sends customer_name, account_name and every hand-off
    // note as null. A push therefore never blanks a value already held
    // from a poll; a new event it brings keeps its null note until the
    // next poll fills it in.
    sessionPushReceived: (state, action: PayloadAction<CopilotSession>) => {
      const incoming = action.payload;
      const existing = state.byId[incoming.conversation_id];
      if (!existing) {
        state.byId[incoming.conversation_id] = incoming;
        return;
      }
      const existingIds = new Set(existing.events.map((e) => e.id));
      state.byId[incoming.conversation_id] = {
        ...incoming,
        customer_name: incoming.customer_name ?? existing.customer_name,
        account_name: incoming.account_name ?? existing.account_name,
        events: [...existing.events, ...incoming.events.filter((e) => !existingIds.has(e.id))],
      };
    },

    myInvitesReceived: (state, action: PayloadAction<SessionInvite[]>) => {
      state.myInvites = action.payload;
    },

    // Optimistic removal right after a real respond() call resolves —
    // the next fetchMyInvites() poll would drop it anyway, this just
    // avoids a flash of the just-answered invite before that happens.
    inviteRemoved: (state, action: PayloadAction<{ inviteId: number }>) => {
      state.myInvites = state.myInvites.filter((i) => i.id !== action.payload.inviteId);
    },
  },
});

export const { sessionSnapshotReceived, sessionPushReceived, myInvitesReceived, inviteRemoved } =
  copilotSessionsSlice.actions;

export default copilotSessionsSlice.reducer;

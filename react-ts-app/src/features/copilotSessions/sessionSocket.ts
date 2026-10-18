// Real-time push, Multiplayer Copilot Phase 2b — mirrors revenact-backend's
// services/copilot/consumers.py / routing.py. Sending actions still goes
// through the existing REST calls in sessionApi.ts — this connection
// only ever receives a pushed CopilotSession snapshot, identical in
// shape to what fetchSession() already returns. The reconnect-with-
// backoff plumbing itself lives in lib/socket.ts, shared with
// features/notifications/notificationSocket.ts.
import { connectSocket, type SocketHandle, type SocketOptions } from '../../lib/socket';
import type { CopilotSession } from './types';

export type SessionSocketHandle = SocketHandle;

// The JWT travels as a query param, not an Authorization header — a
// browser can't attach custom headers to a WebSocket handshake at all
// (see the backend's own core/ws_auth.py docstring for the other half
// of this). `accessToken` is passed in by the caller
// (state.auth.accessToken) rather than read from the store directly
// here, so this module has no dependency on the store/authSlice.
export function connectSessionSocket(
  conversationId: number,
  accessToken: string,
  onUpdate: (session: CopilotSession) => void,
  options: SocketOptions = {}
): SessionSocketHandle {
  const path = `/ws/copilot/sessions/${conversationId}/?token=${encodeURIComponent(accessToken)}`;
  return connectSocket(path, (data) => onUpdate(data as CopilotSession), options);
}

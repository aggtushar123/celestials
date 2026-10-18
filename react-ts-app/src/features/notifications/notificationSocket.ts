// Real-time push for this app's own notification bell — mirrors
// revenact-backend's services/notifications/consumers.py / routing.py.
// Unlike features/copilotSessions/sessionSocket.ts (scoped to one open
// conversation), this connection is meant to stay open for as long as
// the user is logged into the app at all — see layouts/DashboardLayout.tsx,
// which owns its lifecycle. The reconnect-with-backoff plumbing itself
// lives in lib/socket.ts, shared with sessionSocket.ts.
import { connectSocket, type SocketHandle, type SocketOptions } from '../../lib/socket';
import type { Notification } from './types';

export type NotificationSocketHandle = SocketHandle;

// Same "?token= query param, not a header" reasoning as
// sessionSocket.ts's own — see that file's docstring.
export function connectNotificationSocket(
  accessToken: string,
  onNotification: (notification: Notification) => void,
  options: SocketOptions = {}
): NotificationSocketHandle {
  const path = `/ws/notifications/?token=${encodeURIComponent(accessToken)}`;
  return connectSocket(path, (data) => onNotification(data as Notification), options);
}

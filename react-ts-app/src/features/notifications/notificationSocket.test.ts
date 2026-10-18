import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectNotificationSocket } from './notificationSocket';

// Unit tier — same fake-global-WebSocket approach as
// features/copilotSessions/sessionSocket.test.ts, since both now share
// lib/socket.ts's own reconnect core.

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {}
}

describe('connectNotificationSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects to the real notifications route with the access token as a query param', () => {
    connectNotificationSocket('real-jwt', () => {});

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain('/ws/notifications/');
    expect(FakeWebSocket.instances[0].url).toContain('token=real-jwt');
  });

  it('calls onNotification with the parsed pushed notification', () => {
    const onNotification = vi.fn();
    connectNotificationSocket('real-jwt', onNotification);
    const socket = FakeWebSocket.instances[0];

    socket.onmessage?.({ data: JSON.stringify({ id: 1, message: 'Carl invited you' }) });

    expect(onNotification).toHaveBeenCalledWith({ id: 1, message: 'Carl invited you' });
  });

  it('disconnect() stops future reconnects', () => {
    const handle = connectNotificationSocket('real-jwt', () => {});
    handle.disconnect();

    FakeWebSocket.instances[0].onclose?.();
    vi.advanceTimersByTime(5000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

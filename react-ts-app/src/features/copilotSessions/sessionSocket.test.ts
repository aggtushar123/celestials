import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectSessionSocket } from './sessionSocket';

// Unit tier — a fake global WebSocket standing in for the real browser
// one, same "mock the transport boundary, not the logic" approach as
// apiClient's own tests mock `fetch`.

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

describe('connectSessionSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects to the real conversation-scoped WS route with the access token as a query param', () => {
    connectSessionSocket(42, 'real-jwt', () => {});

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].url).toContain('/ws/copilot/sessions/42/');
    expect(FakeWebSocket.instances[0].url).toContain('token=real-jwt');
  });

  it('calls onUpdate with the parsed pushed session', () => {
    const onUpdate = vi.fn();
    connectSessionSocket(42, 'real-jwt', onUpdate);
    const socket = FakeWebSocket.instances[0];

    socket.onmessage?.({ data: JSON.stringify({ id: 1, conversation_id: 42 }) });

    expect(onUpdate).toHaveBeenCalledWith({ id: 1, conversation_id: 42 });
  });

  it('a malformed push is skipped, not thrown', () => {
    const onUpdate = vi.fn();
    connectSessionSocket(42, 'real-jwt', onUpdate);
    const socket = FakeWebSocket.instances[0];

    expect(() => socket.onmessage?.({ data: 'not json' })).not.toThrow();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reconnects after a real close, opening a fresh socket', () => {
    connectSessionSocket(42, 'real-jwt', () => {});
    const first = FakeWebSocket.instances[0];

    first.onclose?.();
    vi.advanceTimersByTime(2000);

    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('disconnect() stops future reconnects and closes the live socket', () => {
    const handle = connectSessionSocket(42, 'real-jwt', () => {});
    const first = FakeWebSocket.instances[0];

    handle.disconnect();
    expect(first.closed).toBe(true);

    // A close event that arrives after disconnect() (e.g. the browser's
    // own async close callback) must not schedule a reconnect either.
    first.onclose?.();
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

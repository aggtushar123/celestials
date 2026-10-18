import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSocket } from './socket';
import { HIDDEN_AFTER_MS, IDLE_AFTER_MS } from './presence';

// Unit tier: the idle pause. A paused socket is closed without a
// reconnect, reopens when the person returns, and asks the caller to catch
// up (onResume). The fake fires onclose from close(), as a browser does.

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  closed = false;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

const open = () => FakeWebSocket.instances.filter((socket) => !socket.closed);

describe('connectSocket idle pause', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('closes after 30 idle minutes and stays closed, then reconnects and catches up on input', () => {
    const onResume = vi.fn();
    const handle = connectSocket('/ws/notifications/?token=t', () => {}, { onResume });
    expect(open()).toHaveLength(1);

    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(open()).toHaveLength(0);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    window.dispatchEvent(new Event('pointerdown'));
    expect(open()).toHaveLength(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onResume).toHaveBeenCalledTimes(1);
    handle.disconnect();
  });

  it('closes when the tab has been hidden for 5 minutes and reopens when it is shown', () => {
    const onResume = vi.fn();
    const handle = connectSocket('/ws/notifications/?token=t', () => {}, { onResume });

    setHidden(true);
    vi.advanceTimersByTime(HIDDEN_AFTER_MS);
    expect(open()).toHaveLength(0);

    setHidden(false);
    expect(open()).toHaveLength(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    handle.disconnect();
  });

  it('still reconnects after an ordinary drop while the person is here', () => {
    const handle = connectSocket('/ws/notifications/?token=t', () => {});
    FakeWebSocket.instances[0].onclose?.();
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    handle.disconnect();
  });

  it('does not open at all in a tab that is already away, and opens on return', () => {
    const first = connectSocket('/ws/a/', () => {});
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    const second = connectSocket('/ws/b/', () => {});
    expect(FakeWebSocket.instances.map((socket) => socket.url)).not.toContainEqual(
      expect.stringContaining('/ws/b/')
    );

    window.dispatchEvent(new Event('keydown'));
    expect(open().map((socket) => socket.url)).toEqual([
      expect.stringContaining('/ws/a/'),
      expect.stringContaining('/ws/b/'),
    ]);
    first.disconnect();
    second.disconnect();
  });

  it('a disconnected socket ignores presence afterwards', () => {
    const onResume = vi.fn();
    const handle = connectSocket('/ws/notifications/?token=t', () => {}, { onResume });
    handle.disconnect();

    vi.advanceTimersByTime(IDLE_AFTER_MS);
    window.dispatchEvent(new Event('keydown'));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(onResume).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_AFTER_MS, IDLE_AFTER_MS, isPresent, onPresenceChange } from './presence';

// Unit tier: presence is the tab being visible with some input in the last
// IDLE_AFTER_MS. lib/socket.ts pauses WebSockets while it is false.

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('presence', () => {
  let unsubscribe: () => void = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it('goes away after IDLE_AFTER_MS with no input, and comes back on any input', () => {
    const changes: boolean[] = [];
    unsubscribe = onPresenceChange((present) => changes.push(present));

    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    expect(isPresent()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([false]);

    window.dispatchEvent(new Event('keydown'));
    expect(changes).toEqual([false, true]);
    expect(isPresent()).toBe(true);
  });

  it('input keeps the person present', () => {
    const changes: boolean[] = [];
    unsubscribe = onPresenceChange((present) => changes.push(present));

    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(IDLE_AFTER_MS / 2);
      window.dispatchEvent(new Event('pointerdown'));
    }
    expect(changes).toEqual([]);
  });

  it('goes away after the tab is hidden for HIDDEN_AFTER_MS, and comes back when shown', () => {
    const changes: boolean[] = [];
    unsubscribe = onPresenceChange((present) => changes.push(present));

    setHidden(true);
    vi.advanceTimersByTime(HIDDEN_AFTER_MS - 1);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([false]);

    setHidden(false);
    expect(changes).toEqual([false, true]);
  });

  it('a short trip to another tab changes nothing', () => {
    const changes: boolean[] = [];
    unsubscribe = onPresenceChange((present) => changes.push(present));

    setHidden(true);
    vi.advanceTimersByTime(HIDDEN_AFTER_MS / 2);
    setHidden(false);
    vi.advanceTimersByTime(HIDDEN_AFTER_MS);
    expect(changes).toEqual([]);
  });

  it('input in a hidden tab does not bring the person back', () => {
    const changes: boolean[] = [];
    unsubscribe = onPresenceChange((present) => changes.push(present));

    setHidden(true);
    vi.advanceTimersByTime(HIDDEN_AFTER_MS);
    window.dispatchEvent(new Event('wheel'));
    expect(changes).toEqual([false]);
  });

  it('stops watching, and starts present again, once the last subscriber leaves', () => {
    const first = vi.fn();
    const off = onPresenceChange(first);
    vi.advanceTimersByTime(IDLE_AFTER_MS);
    expect(first).toHaveBeenCalledWith(false);
    off();

    expect(isPresent()).toBe(true);
    const second = vi.fn();
    unsubscribe = onPresenceChange(second);
    window.dispatchEvent(new Event('keydown'));
    expect(second).not.toHaveBeenCalled();
  });
});

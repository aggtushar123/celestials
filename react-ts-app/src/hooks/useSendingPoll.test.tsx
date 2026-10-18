import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useSendingPoll } from './useSendingPoll';

interface Item {
  id: number;
  status: string;
  n: number;
}

/** A tiny stand-in for a real caller (SendPage, SendsSection's SendRow):
 *  holds the item in state and feeds the hook's own answers back into it,
 *  the same way a real poll's result flows back as a new prop — a bare
 *  `renderHook` with a mocked `onUpdate` would not: without a real
 *  re-render the hook's effect never sees a new `item` and so would never
 *  schedule a second read. */
function Harness({ initial, read, intervalMs }: { initial: Item; read: () => Promise<Item>; intervalMs?: number }) {
  const [item, setItem] = useState(initial);
  useSendingPoll(item.id, item, read, setItem, intervalMs);
  return null;
}

describe('useSendingPoll', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads again after intervalMs, not a moment before', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue({ id: 1, status: 'sending', n: 2 } satisfies Item);
    render(<Harness initial={{ id: 1, status: 'sending', n: 1 }} read={read} intervalMs={5000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4900);
    });
    expect(read).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps reading every interval while the item stays sending', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue({ id: 1, status: 'sending', n: 2 } satisfies Item);
    render(<Harness initial={{ id: 1, status: 'sending', n: 1 }} read={read} intervalMs={5000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('stops once the item leaves sending', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue({ id: 1, status: 'sending', n: 1 } satisfies Item);
    render(<Harness initial={{ id: 1, status: 'sent', n: 1 }} read={read} intervalMs={5000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('stops polling once the component unmounts', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue({ id: 1, status: 'sending', n: 1 } satisfies Item);
    const { unmount } = render(<Harness initial={{ id: 1, status: 'sending', n: 1 }} read={read} intervalMs={5000} />);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('backs off after a failed read, doubling the wait, then resets once a read succeeds', async () => {
    vi.useFakeTimers();
    let call = 0;
    const read = vi.fn(() => {
      call += 1;
      // The first two reads fail; the rest succeed without changing the item,
      // so the hook's own effect still re-arms on an unchanged `sending` item.
      if (call <= 2) return Promise.reject(new Error('mail server down'));
      return Promise.resolve({ id: 1, status: 'sending', n: 1 } satisfies Item);
    });
    render(<Harness initial={{ id: 1, status: 'sending', n: 1 }} read={read} intervalMs={5000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(read).toHaveBeenCalledTimes(1); // failed: next wait doubles to 10s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(read).toHaveBeenCalledTimes(1); // only 5s since the failure: too soon
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(read).toHaveBeenCalledTimes(2); // 10s since the failure
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(read).toHaveBeenCalledTimes(2); // the second failure's wait is 20s: not yet at +10s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(read).toHaveBeenCalledTimes(3); // 20s since the second failure: succeeds this time
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999);
    });
    expect(read).toHaveBeenCalledTimes(3); // a success resets the wait to the plain 5s, not yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(read).toHaveBeenCalledTimes(4);
  });
});

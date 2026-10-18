import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { calls } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { feedChanged } from './taskChanges';
import { useFeed } from './useFeed';

describe('useFeed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the feed for the chip, and again for another chip', async () => {
    const { spy } = stubFeed();
    const { result, rerender } = renderHook(({ chip }) => useFeed(chip), { initialProps: { chip: null as 'approval' | null } });
    await waitFor(() => expect(result.current.data?.groups[0].count).toBe(4));
    rerender({ chip: 'approval' });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.groups[0].count).toBe(1));
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/', '/work/feed/?kind=rule_review']);
  });

  it('keeps the list on screen during a reload, and shows an error only without one', async () => {
    stubFeed({ failFeed: 1 });
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.error).toBe('Down.'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('pages a group with Show more', async () => {
    const { spy } = stubFeed({ pageSize: 1 });
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.data?.groups[3].next).toBe('week:1'));
    await act(() => result.current.showMore('week', 'week:1'));
    expect(result.current.data?.groups[3].items.map((i) => i.id)).toEqual([47, 43]);
    expect(result.current.paging.week).toBeUndefined();
    expect(calls(spy, 'GET', '/work/feed/')).toContain('/work/feed/?group=week&cursor=week%3A1');
  });

  it('retries a failed decide source on its own group, and a failed task source with a reload', async () => {
    const { spy } = stubFeed({ failKinds: { question: 1, task: 1 } });
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.data?.failed).toEqual(['question', 'task', 'todo']));
    act(() => result.current.retry({ at: 'decide', kinds: ['question'], retry: 'decide' }));
    await waitFor(() => expect(result.current.data?.failed).toEqual(['task', 'todo']));
    expect(result.current.data?.groups[0].count).toBe(4);
    act(() => result.current.retry({ at: 'overdue', kinds: ['task', 'todo'], retry: 'all' }));
    await waitFor(() => expect(result.current.data?.failed).toEqual([]));
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/', '/work/feed/?group=decide', '/work/feed/']);
  });

  /** Holds every group read until released, so a test can land it late. */
  function hold() {
    const real = globalThis.fetch;
    const held: (() => void)[] = [];
    let reads = 0;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('group=')) return real(input, init);
      reads += 1;
      return new Promise<Response>((resolve, reject) => {
        held.push(() => real(input, init).then(resolve, reject));
      });
    });
    return { held, reads: () => reads };
  }

  it('ignores a Show more page that lands after a reload', async () => {
    stubFeed({ pageSize: 1 });
    const gate = hold();
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.data?.groups[3].next).toBe('week:1'));
    act(() => void result.current.showMore('week', 'week:1'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.paging.week).toBeUndefined());
    await act(async () => {
      gate.held.forEach((release) => release());
    });
    expect(result.current.data?.groups[3].items.map((i) => i.id)).toEqual([47]);
    expect(result.current.data?.groups[3].next).toBe('week:1');
    expect(result.current.paging.week).toBeUndefined();
  });

  it('does not show a stale Show more error on another chip', async () => {
    stubFeed({ pageSize: 1 });
    const real = globalThis.fetch;
    let fail: (() => void) | null = null;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes('group=')) return real(input, init);
      return new Promise<Response>((_, reject) => {
        fail = () => reject(new Error('Late.'));
      });
    });
    const { result, rerender } = renderHook(({ chip }) => useFeed(chip), { initialProps: { chip: null as 'approval' | null } });
    await waitFor(() => expect(result.current.data?.groups[3].next).toBe('week:1'));
    act(() => void result.current.showMore('week', 'week:1'));
    rerender({ chip: 'approval' });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => fail?.());
    expect(result.current.paging).toEqual({});
  });

  it('reads a group page once for a double Show more', async () => {
    stubFeed({ pageSize: 1 });
    const gate = hold();
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.data?.groups[3].next).toBe('week:1'));
    act(() => {
      void result.current.showMore('week', 'week:1');
      void result.current.showMore('week', 'week:1');
    });
    expect(gate.reads()).toBe(1);
    await act(async () => {
      gate.held.forEach((release) => release());
    });
    await waitFor(() => expect(result.current.paging.week).toBeUndefined());
  });

  it('does not read the feed again on feedChanged (only the badge does)', async () => {
    const { spy } = stubFeed();
    const { result } = renderHook(() => useFeed(null));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => feedChanged());
    await act(async () => undefined);
    expect(calls(spy, 'GET', '/work/feed/')).toEqual(['/work/feed/']);
  });
});

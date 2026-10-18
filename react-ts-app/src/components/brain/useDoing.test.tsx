import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { stubBrain } from '../../features/brain/testBrain';
import { useDoing } from './useDoing';

describe('useDoing (final review minor 2: no whole-page skeleton on a re-read)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the last payload on screen while a retry’s answer is in flight, and drops it only on a new scope', async () => {
    stubBrain();
    const { result, rerender } = renderHook(({ scope }) => useDoing(scope, () => false), { initialProps: { scope: 'me' as ScopeKey } });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const first = result.current.data;

    act(() => result.current.retry());
    // The second `doing/` read hasn't resolved yet (it's a microtask), but
    // the page must not drop to the skeleton: the old payload stays put.
    expect(result.current.data).toBe(first);
    await waitFor(() => expect(result.current.data).not.toBe(first));
    expect(result.current.data?.scope).toBe('me');

    rerender({ scope: 'team' });
    await waitFor(() => expect(result.current.data?.scope).toBe('team'));
  });

  it('clears a stale error once a retry is under way, even before the new read lands', async () => {
    stubBrain({ failDoing: 1 });
    const { result } = renderHook(() => useDoing('me', () => false));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
  });
});

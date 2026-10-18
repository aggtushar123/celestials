import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { useScopedRead } from './useScopedRead';

type Data = { label: string };
function deferred() {
  let resolve!: (v: Data) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Data>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(onRefused: (err: unknown) => boolean = () => false) {
  const pending: { scope: ScopeKey; d: ReturnType<typeof deferred> }[] = [];
  const read = vi.fn((scope: ScopeKey) => {
    const d = deferred();
    pending.push({ scope, d });
    return d.promise;
  });
  const hook = renderHook(({ scope }: { scope: ScopeKey | null }) => useScopedRead(scope, read, onRefused, 'Could not load.'), {
    initialProps: { scope: null as ScopeKey | null },
  });
  return { read, pending, hook };
}

describe('useScopedRead (customers plan Decision 2)', () => {
  it('reads nothing until the scope settles, then reads it once', async () => {
    const { read, pending, hook } = setup();
    expect(read).not.toHaveBeenCalled();
    hook.rerender({ scope: 'me' });
    expect(read).toHaveBeenCalledWith('me');
    await act(async () => pending[0].d.resolve({ label: 'me' }));
    expect(hook.result.current.data).toEqual({ label: 'me' });
  });

  it('drops to nothing on a switch, and drops a slower answer for the old scope', async () => {
    const { pending, hook } = setup();
    hook.rerender({ scope: 'me' });
    await act(async () => pending[0].d.resolve({ label: 'me' }));
    hook.rerender({ scope: 'team' });
    expect(hook.result.current.data).toBeNull();
    hook.rerender({ scope: 'company' });
    await act(async () => pending[1].d.resolve({ label: 'team' }));
    expect(hook.result.current.data).toBeNull();
    await act(async () => pending[2].d.resolve({ label: 'company' }));
    expect(hook.result.current.data).toEqual({ label: 'company' });
  });

  it('keeps the last answer on screen while a retry for the same scope is in flight', async () => {
    const { read, pending, hook } = setup();
    hook.rerender({ scope: 'me' });
    await act(async () => pending[0].d.resolve({ label: 'me' }));
    act(() => hook.result.current.retry());
    expect(read).toHaveBeenCalledTimes(2);
    expect(hook.result.current.data).toEqual({ label: 'me' });
    await act(async () => pending[1].d.resolve({ label: 'me again' }));
    expect(hook.result.current.data).toEqual({ label: 'me again' });
  });

  it('says the fallback on a failure, and hands a refusal to onRefused without an error', async () => {
    const failing = setup();
    failing.hook.rerender({ scope: 'me' });
    await act(async () => failing.pending[0].d.reject(new Error('boom')));
    expect(failing.hook.result.current.error).toBe('Could not load.');

    const onRefused = vi.fn(() => true);
    const refused = setup(onRefused);
    refused.hook.rerender({ scope: 'team' });
    await act(async () => refused.pending[0].d.reject(new Error('403')));
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(refused.hook.result.current.error).toBeNull();
  });
});

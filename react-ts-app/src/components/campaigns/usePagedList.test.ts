import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePagedList, type Page } from './usePagedList';

type Row = { id: string };
type P = Page<Row> & { hidden: number };
type Call = { key: string; cursor: string | null; resolve: (page: P) => void; reject: (err: unknown) => void };

/** A fetcher whose every call waits until the test answers it. */
function deferred() {
  const calls: Call[] = [];
  const make = (key: string) => (cursor: string | null) =>
    new Promise<P>((resolve, reject) => {
      calls.push({ key, cursor, resolve, reject });
    });
  return { calls, make };
}
const page = (ids: string[], next: string | null, hidden = 0): P => ({ results: ids.map((id) => ({ id })), next, hidden });
const WORDS = { error: 'Could not load.', more: 'Could not load more.' };

function setup() {
  const { calls, make } = deferred();
  const hook = renderHook(({ key }: { key: string }) => usePagedList<P>(key, make(key), WORDS), { initialProps: { key: 'all' } });
  return { calls, hook };
}

describe('usePagedList', () => {
  it('reads the first page, appends the next with Show more, and keeps the last page for its extras', async () => {
    const { calls, hook } = setup();
    expect(hook.result.current.rows).toBeNull();
    await act(async () => calls[0].resolve(page(['a1'], 'c2', 1)));
    expect(hook.result.current.rows?.map((row) => row.id)).toEqual(['a1']);
    act(() => hook.result.current.showMore());
    expect(hook.result.current.more.busy).toBe(true);
    expect(calls[1].cursor).toBe('c2');
    await act(async () => calls[1].resolve(page(['a2'], null, 3)));
    expect(hook.result.current.rows?.map((row) => row.id)).toEqual(['a1', 'a2']);
    expect(hook.result.current.page?.hidden).toBe(3);
    expect(hook.result.current.next).toBeNull();
    expect(hook.result.current.more).toEqual({ busy: false, error: null });
  });

  it('drops a Show more that answers after the key changed: the new list shows, never a stuck skeleton', async () => {
    const { calls, hook } = setup();
    await act(async () => calls[0].resolve(page(['a1'], 'c2')));
    act(() => hook.result.current.showMore());
    hook.rerender({ key: 'skipped' });
    expect(hook.result.current.more.busy).toBe(false);
    await act(async () => calls[2].resolve(page(['s1'], null)));
    await act(async () => calls[1].resolve(page(['a2'], null)));
    expect(hook.result.current.rows?.map((row) => row.id)).toEqual(['s1']);
    expect(hook.result.current.more).toEqual({ busy: false, error: null });
  });

  it('never shows a stale "Could not load more" after the key changed', async () => {
    const { calls, hook } = setup();
    await act(async () => calls[0].resolve(page(['a1'], 'c2')));
    act(() => hook.result.current.showMore());
    await act(async () => calls[1].reject(new Error('offline')));
    expect(hook.result.current.more.error).toBe('Could not load more.');
    hook.rerender({ key: 'skipped' });
    await act(async () => calls[2].resolve(page(['s1'], 'd2')));
    expect(hook.result.current.more).toEqual({ busy: false, error: null });
    // A Show more failing late, after another change, is dropped too.
    act(() => hook.result.current.showMore());
    hook.rerender({ key: 'sent' });
    await act(async () => calls[4].resolve(page(['t1'], null)));
    await act(async () => calls[3].reject(new Error('offline')));
    expect(hook.result.current.rows?.map((row) => row.id)).toEqual(['t1']);
    expect(hook.result.current.more.error).toBeNull();
  });

  it('drops an old Show more even when the key comes back to the same value', async () => {
    const { calls, hook } = setup();
    await act(async () => calls[0].resolve(page(['a1'], 'c2')));
    act(() => hook.result.current.showMore());
    hook.rerender({ key: 'skipped' });
    hook.rerender({ key: 'all' });
    await act(async () => calls[3].resolve(page(['a1'], 'c2')));
    await act(async () => calls[1].resolve(page(['old'], null)));
    expect(hook.result.current.rows?.map((row) => row.id)).toEqual(['a1']);
    expect(hook.result.current.next).toBe('c2');
  });

  it('shows an error, then reads again on retry', async () => {
    const { calls, hook } = setup();
    await act(async () => calls[0].reject(new Error('offline')));
    expect(hook.result.current.error).toBe('Could not load.');
    act(() => hook.result.current.retry());
    expect(hook.result.current.error).toBeNull();
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].resolve(page(['a1'], null)));
    expect(hook.result.current.rows?.map((row) => row.id)).toEqual(['a1']);
  });
});

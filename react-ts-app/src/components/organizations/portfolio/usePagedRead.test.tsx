import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePagedRead } from './usePagedRead';

const NOUN = { one: 'widget', many: 'widgets' };
type Row = { id: number };
type Page = { results: Row[]; next_cursor: string | null; count: number };

describe('usePagedRead', () => {
  it('reads page one, appends the next page and reports what landed', async () => {
    const read = vi.fn(
      async (query: string): Promise<Page> =>
        query.includes('cursor=2')
          ? { results: [{ id: 3 }], next_cursor: null, count: 3 }
          : { results: [{ id: 1 }, { id: 2 }], next_cursor: '2', count: 3 },
    );
    const onLoaded = vi.fn();
    const { result } = renderHook(() => usePagedRead<Row, Page>(read, NOUN, 'limit=2', true, 0, onLoaded));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([1, 2]));
    expect(result.current.data?.count).toBe(3);
    expect(result.current.loadedQuery).toBe('limit=2');
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.rows.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(read).toHaveBeenLastCalledWith('limit=2&cursor=2');
    expect(onLoaded).toHaveBeenCalledTimes(2);
  });

  it('reads nothing while disabled, and names its noun when a read fails', async () => {
    const read = vi.fn(async (): Promise<Page> => {
      throw new Error('boom');
    });
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePagedRead<Row, Page>(read, NOUN, 'q', enabled, 0),
      { initialProps: { enabled: false } },
    );
    expect(read).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.error).toBe('Could not load widgets.'));
    expect(result.current.data).toBeNull();
  });

  it('reads again on retry and on a new version', async () => {
    const read = vi.fn(async (): Promise<Page> => ({ results: [], next_cursor: null, count: 0 }));
    const { result, rerender } = renderHook(({ version }: { version: number }) => usePagedRead<Row, Page>(read, NOUN, 'q', true, version), {
      initialProps: { version: 0 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.retry());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    rerender({ version: 1 });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  });
});

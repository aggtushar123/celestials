import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { BulkResult } from '../../../features/organizations/portfolioTypes';
import { usePortfolioBulk } from './usePortfolioBulk';

// Unit tier: the portfolios' shared selection and bulk rules, on their own.
const NOUN = { one: 'thing', many: 'things' };
type Props = { loadedQuery: string; rows: { id: number }[]; grouped: boolean };

function setup(bulk: (body: { ids: number[]; action: 'set'; value: string }) => Promise<BulkResult>, exportRows = vi.fn(async () => {})) {
  const reload = vi.fn();
  const setNotice = vi.fn();
  const hook = renderHook(
    ({ loadedQuery, rows, grouped }: Props) =>
      usePortfolioBulk<'set', string>({
        book: { loadedQuery, rows },
        grouped,
        isSm: true,
        noun: NOUN,
        nameOf: (id) => `Thing ${id}`,
        bulk,
        exportRows,
        reload,
        setNotice,
      }),
    { initialProps: { loadedQuery: 'a', rows: [{ id: 1 }, { id: 2 }, { id: 3 }], grouped: false } },
  );
  return { ...hook, reload, setNotice };
}

describe('usePortfolioBulk', () => {
  it("keeps the Select toggle's mode from sm only when asked to (Pipelines)", () => {
    const mode = (selectAtEveryWidth: boolean) => {
      const { result } = renderHook(() =>
        usePortfolioBulk<'set', string>({
          book: { loadedQuery: 'a', rows: [{ id: 1 }] },
          grouped: false,
          isSm: true,
          selectAtEveryWidth,
          noun: NOUN,
          nameOf: (id) => `Thing ${id}`,
          bulk: async () => ({ updated: [], failed: [] }),
          exportRows: async () => {},
          reload: vi.fn(),
          setNotice: vi.fn(),
        }),
      );
      act(() => result.current.toggleSelectMode());
      return result.current.selecting;
    };
    expect(mode(false)).toBe(false);
    expect(mode(true)).toBe(true);
  });

  it('prunes the selection to page one when a flat list lands, and clears it when a grouped one does', () => {
    const { result, rerender } = setup(async () => ({ updated: [], failed: [] }));
    act(() => {
      result.current.selection.toggle(1);
      result.current.selection.toggle(3);
    });
    rerender({ loadedQuery: 'b', rows: [{ id: 3 }], grouped: false });
    expect([...result.current.selection.selected]).toEqual([3]);
    rerender({ loadedQuery: 'c', rows: [{ id: 3 }], grouped: true });
    expect(result.current.selection.selected.size).toBe(0);
  });

  it('reports a bulk edit with failed names, keeps the failures selected and reloads', async () => {
    const bulk = vi.fn(async () => ({ updated: [1], failed: [{ id: 2, reason: 'Nope.' }] }));
    const { result, reload } = setup(bulk);
    act(() => {
      result.current.selection.toggle(1);
      result.current.selection.toggle(2);
    });
    await act(() => result.current.runBulk('set', 'x'));
    expect(bulk).toHaveBeenCalledWith({ ids: [1, 2], action: 'set', value: 'x' });
    expect(result.current.report).toEqual({ updated: 1, failed: [{ id: 2, reason: 'Nope.', name: 'Thing 2' }] });
    expect([...result.current.selection.selected]).toEqual([2]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing selected when a different list landed while the edit ran', async () => {
    let finish: (result: BulkResult) => void = () => {};
    const { result, rerender } = setup(() => new Promise((resolve) => (finish = resolve)));
    act(() => result.current.selection.toggle(2));
    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.runBulk('set', 'x');
    });
    expect(result.current.activity).toBe('applying');
    rerender({ loadedQuery: 'b', rows: [{ id: 2 }], grouped: false });
    await act(async () => {
      finish({ updated: [], failed: [{ id: 2, reason: 'Nope.' }] });
      await running;
    });
    expect(result.current.selection.selected.size).toBe(0);
  });

  it('says why a bulk edit or an export failed, in the noun', async () => {
    const { result, setNotice } = setup(
      async () => Promise.reject(new Error('boom')),
      vi.fn(async () => Promise.reject(new Error('boom'))),
    );
    await act(() => result.current.runBulk('set', 'x'));
    expect(result.current.report?.error).toBe('Could not update these things.');
    await act(() => result.current.runExport('q=1'));
    await waitFor(() => expect(setNotice).toHaveBeenLastCalledWith('Could not export things.'));
  });
});

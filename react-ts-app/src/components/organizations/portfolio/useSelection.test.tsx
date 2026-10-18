import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelection } from './useSelection';
import { MAX_IDS } from '../../../features/organizations/portfolioParams';

describe('useSelection', () => {
  it('toggles, replaces and clears', () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.selecting).toBe(false);
    act(() => result.current.toggle(7));
    act(() => result.current.toggle(1));
    expect([...result.current.selected]).toEqual([7, 1]);
    expect(result.current.selecting).toBe(true);
    act(() => result.current.toggle(7));
    expect([...result.current.selected]).toEqual([1]);
    act(() => result.current.replace([2, 3]));
    expect([...result.current.selected]).toEqual([2, 3]);
    act(() => result.current.clear());
    expect(result.current.selecting).toBe(false);
  });

  it('prunes selections that are no longer among the visible ids', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle(7));
    act(() => result.current.toggle(1));
    act(() => result.current.toggle(2));
    act(() => result.current.prune([1, 99]));
    expect([...result.current.selected]).toEqual([1]);
  });

  it('leaves selection untouched when pruning changes nothing', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle(1));
    const before = result.current.selected;
    act(() => result.current.prune([1, 2, 3]));
    expect(result.current.selected).toBe(before);
  });

  it('caps selection at MAX_IDS via toggle and reports atLimit', () => {
    const { result } = renderHook(() => useSelection());
    act(() => {
      for (let id = 1; id <= MAX_IDS + 1; id += 1) result.current.toggle(id);
    });
    expect(result.current.selected.size).toBe(MAX_IDS);
    expect(result.current.atLimit).toBe(true);
    expect(result.current.selected.has(MAX_IDS + 1)).toBe(false);

    // Removing one below the cap frees a slot for a fresh add.
    act(() => result.current.toggle(1));
    expect(result.current.atLimit).toBe(false);
    act(() => result.current.toggle(MAX_IDS + 1));
    expect(result.current.selected.has(MAX_IDS + 1)).toBe(true);
  });

  it('caps selection at MAX_IDS via replace', () => {
    const { result } = renderHook(() => useSelection());
    const many = Array.from({ length: MAX_IDS + 100 }, (_, i) => i + 1);
    act(() => result.current.replace(many));
    expect(result.current.selected.size).toBe(MAX_IDS);
    expect(result.current.atLimit).toBe(true);
  });
});

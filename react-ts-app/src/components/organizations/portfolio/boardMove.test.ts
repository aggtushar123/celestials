import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { globex, initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { boardColumns, useOverlayActive, withMove, withMovedRow, type BoardMove } from './boardMove';

const groups = [
  { key: 'adoption', label: 'Adoption', count: 1, arr: 120000 },
  { key: 'live', label: 'Live', count: 1, arr: 69600 },
];
const move: BoardMove = { token: 1, row: pizzaHut, from: 'live', to: 'adoption' };

describe('boardColumns', () => {
  it('gives every lifecycle stage a column in canonical order, empty ones at zero', () => {
    const columns = boardColumns('lifecycle', groups, false);
    expect(columns.map((column) => column.key)).toEqual([
      'onboarding', 'kickoff', 'adoption', 'live', 'renewal', 'churn', 'expansion', 'other',
    ]);
    expect(columns.find((column) => column.key === 'kickoff')).toEqual({ key: 'kickoff', label: 'Kickoff', count: 0, arr: 0, dropOnly: false });
    expect(columns.find((column) => column.key === 'live')).toEqual({ key: 'live', label: 'Live', count: 1, arr: 69600, dropOnly: false });
  });

  it('makes Churn a drop target only while churned accounts are hidden', () => {
    expect(boardColumns('lifecycle', groups, false).find((column) => column.key === 'churn')).toEqual({
      key: 'churn', label: 'Churn', count: 0, arr: 0, dropOnly: true,
    });
    const withChurn = [...groups, { key: 'churn', label: 'Churn', count: 1, arr: 30000 }];
    expect(boardColumns('lifecycle', withChurn, true).find((column) => column.key === 'churn')).toEqual({
      key: 'churn', label: 'Churn', count: 1, arr: 30000, dropOnly: false,
    });
  });

  it('uses only the server groups, in its order, for other groupings', () => {
    const health = [
      { key: 'average', label: 'Average', count: 1, arr: 69600 },
      { key: 'good', label: 'Good', count: 1, arr: 120000 },
    ];
    expect(boardColumns('health', health, false)).toEqual([
      { key: 'average', label: 'Average', count: 1, arr: 69600, dropOnly: false },
      { key: 'good', label: 'Good', count: 1, arr: 120000, dropOnly: false },
    ]);
  });
});

describe('withMove', () => {
  it('moves one count and its ARR from the old column to the new, and leaves the rest', () => {
    const columns = boardColumns('lifecycle', groups, false);
    const live = columns.find((column) => column.key === 'live')!;
    const adoption = columns.find((column) => column.key === 'adoption')!;
    const kickoff = columns.find((column) => column.key === 'kickoff')!;
    expect(withMove(live, move)).toMatchObject({ count: 0, arr: 0 });
    expect(withMove(adoption, move)).toMatchObject({ count: 2, arr: 189600 });
    expect(withMove(kickoff, move)).toBe(kickoff);
    expect(withMove(live, null)).toBe(live);
  });
});

describe('withMovedRow', () => {
  it('takes the card out of every other column and puts it on top of its new one, once, with its new stage', () => {
    expect(withMovedRow([pizzaHut, initech], 'live', move).map((row) => row.id)).toEqual([2]);
    const moved = withMovedRow([globex], 'adoption', move);
    expect(moved.map((row) => row.id)).toEqual([7, 1]);
    expect(moved[0].lifecycle).toEqual({ value: 'adoption', label: 'Adoption' });
    expect(withMovedRow([globex, pizzaHut], 'adoption', move).map((row) => row.id)).toEqual([7, 1]);
    expect(withMovedRow([globex], 'adoption', null)).toEqual([globex]);
  });
});

describe('useOverlayActive', () => {
  it('holds a move until a fresh page lands, and never without a move', () => {
    const { result, rerender } = renderHook(({ token, loadedKey }) => useOverlayActive(token, loadedKey), {
      initialProps: { token: null as number | null, loadedKey: 'a' as string | null },
    });
    expect(result.current).toBe(false);
    rerender({ token: 1, loadedKey: 'a' });
    expect(result.current).toBe(true);
    rerender({ token: 1, loadedKey: 'a' });
    expect(result.current).toBe(true);
    rerender({ token: 1, loadedKey: 'b' });
    expect(result.current).toBe(false);
    rerender({ token: 2, loadedKey: 'b' });
    expect(result.current).toBe(true);
    rerender({ token: null, loadedKey: 'b' });
    expect(result.current).toBe(false);
  });
});

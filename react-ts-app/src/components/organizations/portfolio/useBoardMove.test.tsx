import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer from '../../../features/customers/customersSlice';
import { globex, patchBodies, pizzaHut, stubPortfolio } from '../../../features/organizations/testPortfolio';
import { useBoardMove } from './useBoardMove';

function setup() {
  const store = configureStore({ reducer: { customers: customersReducer } });
  const onSaved = vi.fn();
  const onChurn = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useBoardMove({ onSaved, onChurn }), { wrapper });
  return { ...hook, onSaved, onChurn };
}

describe('useBoardMove', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the move at once, saves it with one PATCH, then reports it', async () => {
    const spy = stubPortfolio();
    const { result, onSaved } = setup();
    act(() => result.current.moveTo(pizzaHut, 'adoption'));
    expect(result.current.move).toMatchObject({ row: pizzaHut, from: 'live', to: 'adoption' });
    expect(result.current.saving).toBe(true);
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(patchBodies(spy)).toEqual([{ id: 7, body: { lifecycle_stage: 'adoption' } }]);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ token: 1, from: 'live', to: 'adoption' }));
    expect(result.current.notice).toBe('Moved Pizza Hut to Adoption.');
    expect(result.current.error).toBeNull();
    // Saved, but still shown (and still one at a time) until its reloads land.
    expect(result.current.move).toMatchObject({ token: 1, saved: true });
    expect(result.current.busy).toBe(true);
  });

  it('forgets a saved move once its reloads have landed, and takes the next move after that', async () => {
    const spy = stubPortfolio();
    const { result } = setup();
    act(() => result.current.moveTo(pizzaHut, 'adoption'));
    await waitFor(() => expect(result.current.move?.saved).toBe(true));
    // A second move before the first settles is refused, so the first
    // card's guess can't be dropped before its fresh pages arrive.
    act(() => result.current.moveTo(globex, 'renewal'));
    expect(result.current.move?.row).toBe(pizzaHut);
    act(() => result.current.settle(99));
    expect(result.current.move).not.toBeNull();
    act(() => result.current.settle(1));
    expect(result.current.move).toBeNull();
    expect(result.current.busy).toBe(false);
    act(() => result.current.moveTo(globex, 'renewal'));
    await waitFor(() => expect(patchBodies(spy)).toHaveLength(2));
  });

  it('puts it back with the server reason when the save fails', async () => {
    stubPortfolio({ patch: () => ({ status: 403, body: { detail: 'You do not have permission to perform this action.' } }) });
    const { result, onSaved } = setup();
    act(() => result.current.moveTo(pizzaHut, 'renewal'));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.move).toBeNull();
    expect(result.current.error).toBe("Couldn't move Pizza Hut to Renewal. You do not have permission to perform this action.");
    expect(onSaved).not.toHaveBeenCalled();
    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });

  it('hands churn to the modal without a PATCH, and ignores a move to the same stage', () => {
    const spy = stubPortfolio();
    const { result, onChurn } = setup();
    act(() => result.current.moveTo(pizzaHut, 'churn'));
    expect(onChurn).toHaveBeenCalledWith(pizzaHut);
    act(() => result.current.moveTo(pizzaHut, 'live'));
    expect(result.current.move).toBeNull();
    expect(patchBodies(spy)).toEqual([]);
  });

  it('takes one move at a time, and forgets the last one on reset', async () => {
    const spy = stubPortfolio();
    const { result } = setup();
    act(() => result.current.moveTo(pizzaHut, 'adoption'));
    act(() => result.current.moveTo(pizzaHut, 'renewal'));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(patchBodies(spy)).toHaveLength(1);
    expect(result.current.move?.to).toBe('adoption');
    act(() => result.current.reset());
    expect(result.current.move).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { accountStoryQueries, stubAccountPage } from '../../../features/accounts/testAccountPage';
import { useStory } from '../../organizations/detail/useStory';

const EMEA = { kind: 'account' as const, id: 12, name: 'Pizza EMEA' };

describe('useStory on one account', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the account story and pages it', async () => {
    const spy = stubAccountPage();
    const { result } = renderHook(() => useStory(EMEA, 'limit=2', 0, true));
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([141, 112]));
    expect(result.current.next).toBe('2');
    await act(() => result.current.loadMore());
    expect(result.current.items.map((item) => item.id)).toEqual([141, 112, 188, 105]);
    expect(accountStoryQueries(spy).map((query) => query.toString())).toEqual(['limit=2', 'limit=2&cursor=2']);
  });

  it('does not read again when the same account arrives as a new object', async () => {
    const spy = stubAccountPage();
    const { rerender, result } = renderHook(({ name }) => useStory({ kind: 'account', id: 12, name }, 'limit=30', 0, true), {
      initialProps: { name: '' },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(5));
    rerender({ name: 'Pizza EMEA' });
    expect(accountStoryQueries(spy)).toHaveLength(1);
  });
});

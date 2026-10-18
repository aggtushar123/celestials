import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { calls } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { feedChanged, taskChanged } from './taskChanges';
import { useFeedCount } from './useFeedCount';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useFeedCount (Decision 12)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the badge on mount, after a task change and after a feed change', async () => {
    const { spy } = stubFeed();
    const { result } = renderHook(() => useFeedCount(1), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ decide: 4, overdue: 1, badge: 5, failed: [] }));
    act(() => taskChanged());
    act(() => feedChanged());
    await waitFor(() => expect(calls(spy, 'GET', '/work/feed/count/')).toHaveLength(3));
  });

  it('reads nothing without a user', () => {
    const { spy } = stubFeed();
    const { result } = renderHook(() => useFeedCount(null), { wrapper });
    expect(result.current).toBeNull();
    expect(calls(spy, 'GET', '/work/feed/count/')).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { stubBundles } from '../../features/agents/testBundles';
import { feedChanged } from './taskChanges';
import { useQueues } from './useQueues';

const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useQueues', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the queues and reads again after a Work change', async () => {
    const { spy } = stubBundles();
    const { result } = renderHook(() => useQueues(), { wrapper });
    await waitFor(() => expect(result.current.data?.queues.map((q) => q.key)).toEqual(['mine', 'team', 'company', 'history']));
    const reads = () => spy.mock.calls.filter(([url]) => String(url).endsWith('/work/queues/')).length;
    const before = reads();
    act(() => feedChanged());
    await waitFor(() => expect(reads()).toBe(before + 1));
  });

  it('keeps the last answer when a read fails', async () => {
    stubBundles({ failQueues: 1 });
    const { result } = renderHook(() => useQueues(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('Down.'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).not.toBeNull());
  });
});

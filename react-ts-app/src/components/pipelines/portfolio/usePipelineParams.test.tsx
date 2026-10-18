import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { usePipelineParams } from './usePipelineParams';

function wrapper(url: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
}

describe('usePipelineParams', () => {
  it('reads the URL, writes patches to it, and clears the filters but not the kind, sort or group', () => {
    const { result } = renderHook(
      () => {
        const state = usePipelineParams();
        return { ...state, search: useLocation().search };
      },
      { wrapper: wrapper('/pipelines/list?kind=risks&owner=2&sort=title') },
    );
    expect(result.current.params).toMatchObject({ kind: 'risks', owner: '2', sort: 'title' });
    act(() => result.current.update({ date: 'overdue' }));
    expect(result.current.search).toBe('?kind=risks&owner=2&date=overdue&sort=title');
    act(() => result.current.clearFilters());
    expect(result.current.search).toBe('?kind=risks&sort=title');
  });

  it('drops a stale cursor from another query on any patch, per controller ruling 1', () => {
    const { result } = renderHook(
      () => {
        const state = usePipelineParams();
        return { ...state, search: useLocation().search };
      },
      { wrapper: wrapper('/pipelines/list?cursor=40&owner=2') },
    );
    act(() => result.current.update({ owner: '3' }));
    expect(result.current.search).toBe('?owner=3');
  });
});

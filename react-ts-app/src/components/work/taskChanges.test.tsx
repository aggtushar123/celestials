import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { recommendationsChanged, taskChanged, useRecommendationChanges, useTaskChanges } from './taskChanges';
import { useTaskLink } from './useTaskLink';

describe('taskChanged / useTaskChanges', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls every listener, the latest callback, until unmounted', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: 0 }) })));
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ cb }) => useTaskChanges(cb), { initialProps: { cb: first } });
    act(() => taskChanged());
    expect(first).toHaveBeenCalledTimes(1);
    rerender({ cb: second });
    act(() => taskChanged());
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    unmount();
    act(() => taskChanged());
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('recommendationsChanged / useRecommendationChanges (Decision 5)', () => {
  it('reaches its own listeners and never a task listener', () => {
    const recs = vi.fn();
    const tasks = vi.fn();
    const { unmount } = renderHook(() => {
      useRecommendationChanges(recs);
      useTaskChanges(tasks);
    });
    act(() => recommendationsChanged());
    expect(recs).toHaveBeenCalledTimes(1);
    expect(tasks).not.toHaveBeenCalled();
    unmount();
    act(() => recommendationsChanged());
    expect(recs).toHaveBeenCalledTimes(1);
  });
});

describe('useTaskLink', () => {
  it('opens a task on the page the reader is on, keeping its query', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/brain/waiting?scope=me']}>{children}</MemoryRouter>;
    const { result } = renderHook(() => useTaskLink(), { wrapper });
    expect(result.current(51)).toEqual({ to: { pathname: '/brain/waiting', search: '?scope=me&task=51' }, state: { taskOpenedHere: true } });
  });
});

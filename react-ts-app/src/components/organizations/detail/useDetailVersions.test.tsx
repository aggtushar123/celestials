import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { taskChanged } from '../../work/taskChanges';
import { useDetailVersions } from './useDetailPage';

describe('useDetailVersions', () => {
  it('reads the story again after a task changes in the panel (Work spec §1.5)', () => {
    const { result } = renderHook(() => useDetailVersions());
    expect(result.current.storyVersion).toBe(0);
    act(() => taskChanged());
    expect(result.current.storyVersion).toBe(1);
  });
});

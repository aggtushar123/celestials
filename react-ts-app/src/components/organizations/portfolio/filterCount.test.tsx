import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilterCount } from './filterCount';
import { parseParams } from '../../../features/organizations/portfolioParams';

const none = parseParams(new URLSearchParams());

describe('useFilterCount', () => {
  it('says how many records the list holds, of how many when filtered', () => {
    expect(renderHook(() => useFilterCount(none, null, 14, 120)).result.current).toBe('14 organizations');
    expect(renderHook(() => useFilterCount(parseParams(new URLSearchParams('health=poor')), null, 3, 120)).result.current).toBe('3 of 120 organizations');
    expect(renderHook(() => useFilterCount(none, null, null, null, true)).result.current).toBe('Organizations unavailable');
  });
});

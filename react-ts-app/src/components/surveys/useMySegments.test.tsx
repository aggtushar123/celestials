import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { stubSegments } from '../../features/segments/testSegments';
import { useMySegments } from './useMySegments';

describe('useMySegments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads only the caller's own segments", async () => {
    const spy = stubSegments();
    const { result } = renderHook(() => useMySegments());
    expect(result.current).toEqual({ rows: null, error: null });
    await waitFor(() => expect(result.current.rows?.map((row) => row.name)).toEqual(['Champions', 'Renewal risk']));
    expect(String(spy.mock.calls[0][0])).toContain('/segments/?scope=mine');
  });

  it('says when they could not be read', async () => {
    stubSegments({ list: () => ({ status: 500, body: { detail: 'Segments are down.' } }) });
    const { result } = renderHook(() => useMySegments());
    await waitFor(() => expect(result.current).toEqual({ rows: [], error: 'Segments are down.' }));
  });
});

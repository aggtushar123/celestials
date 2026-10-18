import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { OPPORTUNITIES_KIND } from '../../../features/pipelines/pipelineKinds';
import { parsePipelineParams } from '../../../features/pipelines/pipelineParams';
import { pipelineQueries, stubPipelines } from '../../../features/pipelines/testPipelines';
import { usePipelineBook } from './usePipelineBook';

const params = (query: string) => parsePipelineParams(new URLSearchParams(query));

describe('usePipelineBook', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a flat page of rows, and M for "N of M" when a filter is on', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params('owner=3&group=none'), 'list', 0));
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([43]));
    await waitFor(() => expect(result.current.total).toBe(3));
    const probe = pipelineQueries(spy, 'opportunities').find((query) => query.get('limit') === '1');
    expect(probe?.get('owner')).toBeNull();
  });

  it('reads only the frame when grouped, and no M without a filter', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params(''), 'list', 0));
    await waitFor(() => expect(result.current.data?.count).toBe(3));
    expect(result.current.rows).toEqual([]);
    expect(result.current.total).toBeNull();
    expect(pipelineQueries(spy, 'opportunities').map((query) => query.get('limit'))).toEqual(['1']);
  });

  it('counts M in the chosen stages, so N and M count the same set', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() =>
      usePipelineBook(OPPORTUNITIES_KIND, params('stage=negotiation,discovery&owner=3&group=none'), 'list', 0),
    );
    await waitFor(() => expect(result.current.total).toBe(2));
    expect(result.current.data?.count).toBe(0);
    const probe = pipelineQueries(spy, 'opportunities').find((query) => query.get('limit') === '1');
    expect(probe?.get('stage')).toBe('negotiation,discovery');
    expect(probe?.get('owner')).toBeNull();
  });

  it('keeps ids in the M probe, so with no stage N and M both count every stage of those ids', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params('ids=41,44&owner=2&group=none'), 'list', 0));
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([41]));
    // 44 is Closed Won: counted in M because ids lists every stage, as N does.
    await waitFor(() => expect(result.current.total).toBe(2));
    const probe = pipelineQueries(spy, 'opportunities').find((query) => query.get('limit') === '1');
    expect(probe?.get('ids')).toBe('41,44');
    expect(probe?.get('owner')).toBeNull();
  });

  it('has no M when ids and stages are the only narrowing, since M would equal N', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params('ids=41,44&group=none'), 'list', 0));
    await waitFor(() => expect(result.current.rows.map((row) => row.id).sort()).toEqual([41, 44]));
    expect(result.current.total).toBeNull();
    expect(pipelineQueries(spy, 'opportunities')).toHaveLength(1);
  });

  it("counts the Board's M over every stage, as the Board lists them", async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params('owner=3'), 'board', 0));
    await waitFor(() => expect(result.current.total).toBe(5));
    const probe = pipelineQueries(spy, 'opportunities').find((query) => query.get('limit') === '1' && !query.has('group'));
    expect(probe?.get('stage')?.split(',')).toContain('closed_lost');
  });

  it('has no M when the stage choice is the only filter, since M would equal N', async () => {
    const spy = stubPipelines();
    const { result } = renderHook(() => usePipelineBook(OPPORTUNITIES_KIND, params('stage=negotiation&group=none'), 'list', 0));
    await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual([41]));
    expect(result.current.total).toBeNull();
    expect(pipelineQueries(spy, 'opportunities')).toHaveLength(1);
  });

  it("does not re-send the probe on a sort change alone, since sort can't change a count", async () => {
    const spy = stubPipelines();
    const { result, rerender } = renderHook(({ query }) => usePipelineBook(OPPORTUNITIES_KIND, params(query), 'list', 0), {
      initialProps: { query: 'owner=3&group=none' },
    });
    await waitFor(() => expect(result.current.total).toBe(3));
    const probe = pipelineQueries(spy, 'opportunities').find((query) => query.get('limit') === '1');
    expect(probe?.get('sort')).toBeNull();
    const callsBefore = pipelineQueries(spy, 'opportunities').length;
    rerender({ query: 'owner=3&group=none&sort=title' });
    await waitFor(() => expect(pipelineQueries(spy, 'opportunities').length).toBeGreaterThan(callsBefore));
    expect(pipelineQueries(spy, 'opportunities').filter((query) => query.get('limit') === '1')).toHaveLength(1);
  });
});

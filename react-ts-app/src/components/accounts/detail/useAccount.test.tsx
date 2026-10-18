import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { stubAccountPage } from '../../../features/accounts/testAccountPage';
import { requestPaths } from '../../../features/organizations/testStory';
import { useAccount } from './useAccount';

type Spy = ReturnType<typeof stubAccountPage>;
const portfolioQuery = (spy: Spy) =>
  spy.mock.calls.map(([input]) => new URL(String(input))).find((url) => url.pathname.endsWith('/accounts/portfolio/'))!.searchParams;

describe('useAccount', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the portfolio row by id and the record beside it, by the id alone', async () => {
    const spy = stubAccountPage();
    const { result } = renderHook(() => useAccount(12, 0));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza EMEA'));
    await waitFor(() => expect(result.current.account?.owner?.name).toBe('Carl CSM'));
    expect(result.current.currency).toBe('USD');
    expect(result.current.notFound).toBe(false);
    expect(Object.fromEntries(portfolioQuery(spy))).toEqual({ ids: '12', limit: '1' });
    expect([...requestPaths(spy)].sort()).toEqual(['GET /accounts/12/', 'GET /accounts/portfolio/']);
  });

  it('is not found when the viewer may not open it', async () => {
    stubAccountPage({ row: null });
    const { result } = renderHook(() => useAccount(12, 0));
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.row).toBeNull();
  });

  it('is not found with no id, and reads nothing', () => {
    const spy = stubAccountPage();
    const { result } = renderHook(() => useAccount(null, 0));
    expect(result.current.notFound).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the last row while a new version reads, says so if that read fails, and retries', async () => {
    stubAccountPage();
    const { result, rerender } = renderHook(({ version }) => useAccount(12, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza EMEA'));
    stubAccountPage({ failPortfolio: 1 });
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.row?.name).toBe('Pizza EMEA');
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.row?.name).toBe('Pizza EMEA');
  });
});

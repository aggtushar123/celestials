import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { buildPortfolio, customerFixture, globex, pizzaHut } from '../../../features/organizations/testPortfolio';
import { portfolioRequests, stubOrganizationPage } from '../../../features/organizations/testStory';
import { useOrganization } from './useOrganization';

function fakeResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

type Pending = { url: URL; resolve: (value: unknown) => void };

/** A fetch mock whose promises resolve only when told to, so a test can
 *  choose the order two in-flight requests land in — the shape a race
 *  guard (a `cancelled` flag, a generation counter) exists to handle. */
function deferredFetchSpy() {
  const pending: Pending[] = [];
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return new Promise((resolve) => {
      pending.push({ url, resolve });
    });
  });
  vi.stubGlobal('fetch', spy);
  function resolveNext(match: (url: URL) => boolean, body: unknown, status = 200) {
    const index = pending.findIndex((entry) => match(entry.url));
    if (index === -1) throw new Error('deferredFetchSpy: no matching pending request');
    const [entry] = pending.splice(index, 1);
    entry.resolve(fakeResponse(status, body));
  }
  return { spy, resolveNext };
}

describe('useOrganization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the portfolio row by id (churned and archived included) and the customer beside it', async () => {
    const spy = stubOrganizationPage();
    const { result } = renderHook(() => useOrganization(7, 0));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza Hut'));
    await waitFor(() => expect(result.current.customer?.health_breakdown).toHaveLength(5));
    expect(Object.fromEntries(portfolioRequests(spy)[0])).toEqual({ ids: '7', include_churned: '1', limit: '1' });
    expect(result.current.notFound).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('is not found when the portfolio has no row for this viewer', async () => {
    stubOrganizationPage({ row: null });
    const { result } = renderHook(() => useOrganization(99, 0));
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.row).toBeNull();
  });

  it('is not found for an id that is not a number, with no request', () => {
    const spy = stubOrganizationPage();
    const { result } = renderHook(() => useOrganization(null, 0));
    expect(result.current.notFound).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the row on screen while a new version reloads', async () => {
    const spy = stubOrganizationPage();
    const { result, rerender } = renderHook(({ version }) => useOrganization(7, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.row).not.toBeNull());
    rerender({ version: 1 });
    expect(result.current.loading).toBe(true);
    expect(result.current.row?.id).toBe(7);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(portfolioRequests(spy)).toHaveLength(2);
  });

  it('reports a failed read, and Try again reads again', async () => {
    stubOrganizationPage({ failPortfolio: 1 });
    const { result } = renderHook(() => useOrganization(7, 0));
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.row).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza Hut'));
    expect(result.current.error).toBeNull();
  });

  it('keeps the row on screen and reports the error when a reload fails', async () => {
    stubOrganizationPage();
    const { result, rerender } = renderHook(({ version }) => useOrganization(7, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza Hut'));
    stubOrganizationPage({ failPortfolio: 1 });
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.row?.name).toBe('Pizza Hut');
    expect(result.current.loading).toBe(false);
    expect(result.current.notFound).toBe(false);
  });

  it('never shows a slower id\'s stale response once a faster later id has landed', async () => {
    const { resolveNext } = deferredFetchSpy();
    const { result, rerender } = renderHook(({ id }) => useOrganization(id, 0), { initialProps: { id: 7 } });
    rerender({ id: 1 });

    // The second (later) id's response is faster and lands first.
    resolveNext(
      (url) => url.pathname.endsWith('/organizations/portfolio/') && url.searchParams.get('ids') === '1',
      buildPortfolio(new URLSearchParams({ ids: '1', include_churned: '1', limit: '1' }), [globex]),
    );
    await waitFor(() => expect(result.current.row?.id).toBe(1));

    // The first (abandoned) id's response lands after — it must never show.
    resolveNext(
      (url) => url.pathname.endsWith('/organizations/portfolio/') && url.searchParams.get('ids') === '7',
      buildPortfolio(new URLSearchParams({ ids: '7', include_churned: '1', limit: '1' }), [pizzaHut]),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.row?.id).toBe(1);
  });

  it('updates nothing and logs nothing when a read lands after unmount', async () => {
    const { resolveNext } = deferredFetchSpy();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useOrganization(7, 0));
    unmount();

    resolveNext(
      (url) => url.pathname.endsWith('/organizations/portfolio/'),
      buildPortfolio(new URLSearchParams({ ids: '7', include_churned: '1', limit: '1' }), [pizzaHut]),
    );
    resolveNext((url) => /\/customers\/7\/$/.test(url.pathname), customerFixture);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

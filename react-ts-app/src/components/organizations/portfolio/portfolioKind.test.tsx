import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { buildPortfolio, initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { ORGANIZATION_KIND } from './organizationKind';
import { PortfolioKindContext, subtitleText, usePortfolioKind, type PortfolioKind } from './portfolioKind';
import { WIDGET_KIND } from './testKind';
import { usePortfolio } from './usePortfolio';
import { usePortfolioParams } from './usePortfolioParams';

const withKind =
  (kind: PortfolioKind, url = '/') =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <PortfolioKindContext.Provider value={kind}>{children}</PortfolioKindContext.Provider>
    </MemoryRouter>
  );

describe('the portfolio kind', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is Organizations unless a page provides another', () => {
    const { result } = renderHook(() => usePortfolioKind());
    expect(result.current).toBe(ORGANIZATION_KIND);
  });

  it('describes an organisation row as the Organizations pages always have', () => {
    expect(ORGANIZATION_KIND.href(pizzaHut)).toBe('/organizations/7');
    expect(ORGANIZATION_KIND.linkState(pizzaHut)).toBeUndefined();
    expect(subtitleText(ORGANIZATION_KIND.subtitle(pizzaHut))).toBe('Carl CSM · Live · Touched 33d ago');
    expect(ORGANIZATION_KIND.subtitle(pizzaHut).map((part) => part.field)).toEqual(['owner', 'lifecycleStage', undefined]);
    expect(ORGANIZATION_KIND.cardSubtitle(pizzaHut)).toBe('Carl CSM');
    expect(ORGANIZATION_KIND.status(pizzaHut)).toBeNull();
    expect(ORGANIZATION_KIND.status(initech)).toBe('Churned');
    expect(ORGANIZATION_KIND.addsTo('churn')).toBe(false);
    expect(ORGANIZATION_KIND.addsTo('live')).toBe(true);
    expect(ORGANIZATION_KIND.churnByModal).toBe(true);
    expect(ORGANIZATION_KIND.renewalWindow).toBe('30');
    expect(ORGANIZATION_KIND.totalQuery(parseParams(new URLSearchParams()))).toBeNull();
    expect(ORGANIZATION_KIND.totalQuery(parseParams(new URLSearchParams('owner=2')))).toBe('limit=1');
    expect(ORGANIZATION_KIND.totalQuery(parseParams(new URLSearchParams('owner=2&include_churned=1')))).toBe(
      'include_churned=1&limit=1',
    );
    expect(ORGANIZATION_KIND.churnVisible(parseParams(new URLSearchParams('lifecycle=churn')))).toBe(true);
    expect(ORGANIZATION_KIND.churnVisible(parseParams(new URLSearchParams()))).toBe(false);
  });

  it('reads through the provided kind: its endpoint and its M probe', async () => {
    const fetchPage = vi.fn(async (query: string) => buildPortfolio(new URLSearchParams(query)));
    const kind: PortfolioKind<PortfolioRow> = { ...WIDGET_KIND, fetch: fetchPage };
    const params = parseParams(new URLSearchParams('search=pizza&group=none'));
    const { result } = renderHook(() => usePortfolio(params, 0), { wrapper: withKind(kind) });
    await waitFor(() => expect(result.current.data?.count).toBe(1));
    expect(fetchPage.mock.calls.map(([query]) => query)).toEqual(
      expect.arrayContaining(['search=pizza&sort=-arr&limit=50', 'limit=1']),
    );
    // M is the book the probe counts (the stub leaves churned Initech out).
    await waitFor(() => expect(result.current.total).toBe(2));
  });

  it("says what failed in the kind's own words", async () => {
    const kind: PortfolioKind<PortfolioRow> = {
      ...WIDGET_KIND,
      fetch: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    const { result } = renderHook(() => usePortfolio(parseParams(new URLSearchParams()), 0), { wrapper: withKind(kind) });
    await waitFor(() => expect(result.current.error).toBe('Could not load widgets.'));
  });

  it("parses the URL with the kind's own parameters", () => {
    const { result } = renderHook(() => usePortfolioParams(), {
      wrapper: withKind(WIDGET_KIND, '/?organisation=7&product=3'),
    });
    expect(result.current.params.organisation).toEqual(['7']);
    expect(result.current.params.product).toEqual([]);
  });
});

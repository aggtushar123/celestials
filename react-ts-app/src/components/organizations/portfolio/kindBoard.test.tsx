import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import customersReducer from '../../../features/customers/customersSlice';
import { BOARD_GROUP, boardParams, parseParams, toApiQuery } from '../../../features/organizations/portfolioParams';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { buildPortfolio, globex, initech, pizzaHut, stubPortfolio } from '../../../features/organizations/testPortfolio';
import { PortfolioBoard, type PortfolioBoardProps } from './PortfolioBoard';
import { PortfolioKindContext, type PortfolioKind } from './portfolioKind';
import { WIDGET_KIND } from './testKind';
import { useBoardMove } from './useBoardMove';
import type { PortfolioState } from './usePortfolio';

// Initech sits in Churn but is not churned, so the stub lists it as the
// accounts backend would list any Churn-stage record.
const initechInChurn: PortfolioRow = { ...initech, churned: false };
const ROWS = [pizzaHut, globex, initechInChurn];
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const card = (id: number) => document.querySelector(`[data-card-id="${id}"]`) as HTMLElement;

function renderWidgetBoard(rows: PortfolioRow[], overrides: Partial<PortfolioBoardProps> = {}) {
  const params = boardParams(parseParams(new URLSearchParams(), BOARD_GROUP, WIDGET_KIND.params));
  const query = toApiQuery(params, { limit: '1' });
  const portfolio: PortfolioState = {
    data: buildPortfolio(new URLSearchParams(query), rows),
    rows: [],
    next: null,
    loading: false,
    error: null,
    loadingMore: false,
    moreError: null,
    loadMore: async () => {},
    retry: vi.fn(),
    loadedKey: `${query}#0#0`,
    loadedQuery: query,
    total: null,
  };
  const props: PortfolioBoardProps = {
    params,
    portfolio,
    version: 0,
    columnBumps: {},
    currency: 'USD',
    isSm: true,
    filtered: false,
    move: null,
    saving: false,
    openId: null,
    onOpen: vi.fn(),
    onMove: vi.fn(),
    onRowsLoaded: vi.fn(),
    onClearFilters: vi.fn(),
    onAdd: vi.fn(),
    onMoveSettled: vi.fn(),
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={WIDGET_KIND}>
        <PortfolioBoard {...props} />
      </PortfolioKindContext.Provider>
    </MemoryRouter>,
  );
}

function setupMove(saveStage: PortfolioKind<PortfolioRow>['saveStage']) {
  const store = configureStore({ reducer: { customers: customersReducer } });
  const onSaved = vi.fn();
  const onChurn = vi.fn();
  const kind: PortfolioKind<PortfolioRow> = { ...WIDGET_KIND, saveStage };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <PortfolioKindContext.Provider value={kind}>{children}</PortfolioKindContext.Provider>
    </Provider>
  );
  const hook = renderHook(() => useBoardMove({ onSaved, onChurn }), { wrapper });
  return { ...hook, onSaved, onChurn };
}

describe('the Board reads the kind', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists Churn like any stage when the kind shows it, with a "+" in its words', async () => {
    stubPortfolio({ rows: ROWS });
    renderWidgetBoard(ROWS);
    expect(await within(column('churn')).findByRole('link', { name: 'Initech' })).toHaveAttribute('href', '/widgets/2');
    expect(within(column('churn')).getByRole('button', { name: 'Add widget to Churn' })).toBeInTheDocument();
    expect(screen.queryByText('Churned accounts are hidden.')).not.toBeInTheDocument();
    expect(within(column('onboarding')).getByText('No widgets in Onboarding.')).toBeInTheDocument();
  });

  it("shows the kind's card line, and no Move to… on a record the kind cannot save", async () => {
    stubPortfolio({ rows: ROWS });
    renderWidgetBoard(ROWS);
    await within(column('live')).findByRole('link', { name: 'Pizza Hut' });
    expect(within(card(7)).getByText('Shelf 7')).toBeInTheDocument();
    expect(within(card(7)).getByRole('button', { name: 'Move Pizza Hut to…' })).toBeInTheDocument();
    await within(column('churn')).findByRole('link', { name: 'Initech' });
    expect(within(card(2)).queryByRole('button', { name: 'Move Initech to…' })).not.toBeInTheDocument();
    expect(card(2)).toHaveAttribute('draggable', 'false');
  });

  it("says there is nothing yet in the kind's words", () => {
    stubPortfolio({ rows: [] });
    renderWidgetBoard([]);
    expect(screen.getByText('No widgets yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
  });

  it('saves a move to Churn like any other stage when the kind has no churn form', async () => {
    const saveStage = vi.fn(async () => undefined);
    const { result, onChurn, onSaved } = setupMove(saveStage);
    act(() => result.current.moveTo(pizzaHut, 'churn'));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(saveStage).toHaveBeenCalledWith(pizzaHut, 'churn', expect.any(Function));
    expect(onChurn).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ from: 'live', to: 'churn' }));
    expect(result.current.notice).toBe('Moved Pizza Hut to Churn.');
  });

  it("rolls back in the kind's words when the save fails without a reason", async () => {
    const { result } = setupMove(
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    act(() => result.current.moveTo(pizzaHut, 'adoption'));
    await waitFor(() => expect(result.current.error).toBe("Couldn't move Pizza Hut to Adoption. Could not update widget."));
    expect(result.current.move).toBeNull();
  });
});

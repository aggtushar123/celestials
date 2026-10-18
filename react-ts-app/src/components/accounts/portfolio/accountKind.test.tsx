import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import customersReducer from '../../../features/customers/customersSlice';
import { accountPatches, accountPortfolioQueries, globexNa, initechApac, pizzaEmea, stubAccountsPortfolio } from '../../../features/accounts/testPortfolio';
import { parseParams } from '../../../features/organizations/portfolioParams';
import type { AppDispatch } from '../../../store';
import { BoardCard } from '../../organizations/portfolio/BoardCard';
import { PortfolioKindContext, subtitleText } from '../../organizations/portfolio/portfolioKind';
import { ACCOUNT_KIND } from './accountKind';

const cardProps = {
  currency: 'USD' as const,
  isSm: true,
  open: false,
  canMove: true,
  moveDisabled: false,
  onOpen: vi.fn(),
  onMove: vi.fn(),
  onDragStart: vi.fn(),
  onDragEnd: vi.fn(),
};

describe('ACCOUNT_KIND', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('names an account by its organisation, owner, stage and last touch', () => {
    expect(subtitleText(ACCOUNT_KIND.subtitle(pizzaEmea))).toBe('Pizza Hut +1 · Carl CSM · Live · Touched 33d ago');
    expect(subtitleText(ACCOUNT_KIND.subtitle(globexNa))).toBe('Globex · Priya · Adoption · Touched 2d ago');
    expect(subtitleText(ACCOUNT_KIND.subtitle(initechApac))).toBe('Unassigned · Churn · Never contacted');
    expect(ACCOUNT_KIND.subtitle(pizzaEmea).map((part) => part.field)).toEqual([undefined, 'owner', 'lifecycleStage', undefined]);
    expect(ACCOUNT_KIND.cardSubtitle(pizzaEmea)).toBe('Pizza Hut +1');
    expect(ACCOUNT_KIND.cardSubtitle(initechApac)).toBe('Unassigned');
  });

  it('links to the account page by its id alone', () => {
    expect(ACCOUNT_KIND.href(pizzaEmea)).toBe('/accounts/12');
    expect(ACCOUNT_KIND.linkState(pizzaEmea)).toBeUndefined();
  });

  it('has no archive, no churn form and nothing hidden for churn', () => {
    const filtered = parseParams(new URLSearchParams('owner=2'), 'health', ACCOUNT_KIND.params);
    const bare = parseParams(new URLSearchParams(), 'health', ACCOUNT_KIND.params);
    expect(ACCOUNT_KIND.status(pizzaEmea)).toBeNull();
    expect(ACCOUNT_KIND.churnVisible(bare)).toBe(true);
    expect(ACCOUNT_KIND.churnByModal).toBe(false);
    expect(ACCOUNT_KIND.addsTo('churn')).toBe(true);
    expect(ACCOUNT_KIND.totalQuery(filtered)).toBe('limit=1');
    expect(ACCOUNT_KIND.totalQuery(bare)).toBeNull();
    expect(ACCOUNT_KIND.renewalWindow).toBe('90');
    expect(ACCOUNT_KIND.filters).toEqual({ product: false, organisation: true, churned: false });
  });

  it('edits and moves only an account with an organisation the viewer may open', () => {
    expect(ACCOUNT_KIND.editable(pizzaEmea)).toBe(true);
    expect(ACCOUNT_KIND.editable(initechApac)).toBe(false);
  });

  it('reads GET /accounts/portfolio/, and saves a stage through the account update on its first openable organisation', async () => {
    const spy = stubAccountsPortfolio();
    const data = await ACCOUNT_KIND.fetch('sort=-arr');
    expect(data.count).toBe(3);
    expect(accountPortfolioQueries(spy)).toHaveLength(1);
    const store = configureStore({ reducer: { customers: customersReducer } });
    await ACCOUNT_KIND.saveStage(pizzaEmea, 'churn', store.dispatch as unknown as AppDispatch);
    expect(accountPatches(spy)).toEqual([{ customerId: 7, id: 12, body: { lifecycle_stage: 'churn' } }]);
  });

  it('draws a Board card with the organisation, and Move to… only for an account it can save', () => {
    render(
      <MemoryRouter>
        <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
          <ul>
            <BoardCard row={pizzaEmea} {...cardProps} />
            <BoardCard row={initechApac} {...cardProps} />
          </ul>
        </PortfolioKindContext.Provider>
      </MemoryRouter>,
    );
    const pizza = document.querySelector('[data-card-id="12"]') as HTMLElement;
    expect(within(pizza).getByText('Pizza Hut +1')).toBeInTheDocument();
    expect(within(pizza).getByRole('button', { name: 'Move Pizza EMEA to…' })).toBeInTheDocument();
    expect(within(pizza).getByRole('link', { name: 'Pizza EMEA' })).toHaveAttribute('href', '/accounts/12');
    const initech = document.querySelector('[data-card-id="14"]') as HTMLElement;
    expect(within(initech).queryByRole('button', { name: 'Move Initech APAC to…' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Initech APAC' })).toHaveAttribute('href', '/accounts/14');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { buildPortfolio, initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { AccountRow } from './AccountRow';
import { AccountSheet } from './AccountSheet';
import { AccountSidePanel } from './AccountSidePanel';
import { PortfolioKindContext } from './portfolioKind';
import { PortfolioSections } from './PortfolioSections';
import { WIDGET_KIND } from './testKind';
import type { PortfolioState } from './usePortfolio';

function State() {
  const location = useLocation();
  return <p data-testid="state">{JSON.stringify(location.state)}</p>;
}

function inWidgets(node: ReactNode) {
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={WIDGET_KIND}>
        <Routes>
          <Route path="/" element={node} />
          <Route path="/widgets/:id" element={<State />} />
        </Routes>
      </PortfolioKindContext.Provider>
    </MemoryRouter>,
  );
}

function state(data: PortfolioState['data'], rows: PortfolioState['rows'] = [], next: string | null = null): PortfolioState {
  return {
    data,
    rows,
    next,
    loading: false,
    error: null,
    loadingMore: false,
    moreError: null,
    loadMore: async () => {},
    retry: vi.fn(),
    loadedKey: 'k',
    loadedQuery: 'q',
    total: null,
  };
}

const rowProps = {
  currency: 'USD' as const,
  pins: [],
  isSm: true,
  selecting: false,
  selected: false,
  open: false,
  onToggleSelect: vi.fn(),
  onLongPress: vi.fn(),
  onToggleOpen: vi.fn(),
};

describe('the row, sheet, side panel and sections read the kind', () => {
  it("links the row to the kind's page with its state, and shows the kind's line and no status", async () => {
    inWidgets(
      <ul>
        <AccountRow row={initech} {...rowProps} />
      </ul>,
    );
    const link = screen.getByRole('link', { name: 'Initech' });
    expect(link).toHaveAttribute('href', '/widgets/2');
    expect(link).toHaveAttribute('data-field', 'widget');
    expect(document.querySelector('[data-row-id="2"] p')).toHaveTextContent('Shelf 2 · Churn');
    expect(document.querySelector('[data-row-id="2"] [data-field="lifecycleStage"]')).toHaveTextContent('Churn');
    expect(screen.queryByText('Churned')).not.toBeInTheDocument();
    expect(document.querySelector('[data-field~="aiPulseValue"]')).toHaveTextContent('AI 2 · CSM 1');
    await userEvent.click(link);
    expect(screen.getByTestId('state')).toHaveTextContent('{"widget":2}');
  });

  it("shows the kind's details in the sheet, links to the kind's page, and offers Edit where the kind allows", () => {
    inWidgets(<AccountSheet row={pizzaHut} currency="EUR" onClose={vi.fn()} onEdit={vi.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'Pizza Hut' });
    expect(sheet).toHaveTextContent('Shelf 7 · Live');
    expect(within(sheet).getByTestId('widget-details')).toHaveTextContent('Widget Pizza Hut in EUR');
    expect(within(sheet).getByRole('button', { name: 'Edit widget' })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open widget page' })).toHaveAttribute('href', '/widgets/7');
  });

  it('stacks the side panel and hides Edit where the kind does not allow it', () => {
    inWidgets(<AccountSidePanel row={initech} currency="USD" onClose={vi.fn()} onEdit={vi.fn()} />);
    const panel = screen.getByRole('complementary', { name: 'Initech' });
    expect(panel).toHaveTextContent('Shelf 2 · Churn');
    expect(within(panel).getByTestId('widget-details')).toHaveTextContent('Widget Initech in USD, stacked');
    expect(within(panel).queryByRole('button', { name: 'Edit widget' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Open widget page' })).toHaveAttribute('href', '/widgets/2');
  });

  it("speaks in the kind's words when the list is empty, loading or has more", () => {
    const params = parseParams(new URLSearchParams('group=none'));
    const common = {
      params,
      version: 0,
      currency: 'USD' as const,
      filtered: false,
      onRowsLoaded: vi.fn(),
      onClearFilters: vi.fn(),
      onAdd: vi.fn(),
      renderRow: (row: typeof pizzaHut) => <li key={row.id}>{row.name}</li>,
    };
    const empty = inWidgets(<PortfolioSections {...common} portfolio={state(buildPortfolio(new URLSearchParams('search=zzz')))} />);
    expect(screen.getByText('No widgets yet')).toBeInTheDocument();
    expect(screen.getByText('Add an widget to start your portfolio.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
    empty.unmount();

    const loading = inWidgets(<PortfolioSections {...common} portfolio={state(null)} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading widgets')).toBeInTheDocument();
    loading.unmount();

    inWidgets(
      <PortfolioSections
        {...common}
        portfolio={state(buildPortfolio(new URLSearchParams('search=pizza')), [pizzaHut], 'next')}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Widgets list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more widgets' })).toBeInTheDocument();
  });
});

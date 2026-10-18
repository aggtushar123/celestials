import { describe, expect, it, vi } from 'vitest';
import { createRef, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { buildPortfolio } from '../../../features/organizations/testPortfolio';
import { FilterChips } from './FilterChips';
import { FiltersPanel } from './FiltersPanel';
import { PortfolioKindContext } from './portfolioKind';
import { PortfolioToolbar } from './PortfolioToolbar';
import { SelectionBar } from './SelectionBar';
import { SummaryTiles } from './SummaryTiles';
import { WIDGET_KIND } from './testKind';

const OPTIONS: FilterOptions = {
  owners: [{ value: '2', name: 'Carl CSM' }],
  lifecycles: [{ value: 'live', name: 'Live' }],
  organisations: [
    { value: '7', name: 'Pizza Hut' },
    { value: '1', name: 'Globex' },
  ],
};
const widgetParams = (search: string) => parseParams(new URLSearchParams(search), 'health', WIDGET_KIND.params);

function inWidgets(node: ReactNode) {
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={WIDGET_KIND}>{node}</PortfolioKindContext.Provider>
    </MemoryRouter>,
  );
}

describe('the toolbar, filters, chips, selection and tiles read the kind', () => {
  it("counts an organisation filter, lists the kind's sorts and adds in its words", () => {
    inWidgets(
      <PortfolioToolbar
        params={widgetParams('organisation=7')}
        update={vi.fn()}
        options={OPTIONS}
        isSm
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
        count="3 widgets"
        searchRef={createRef<HTMLInputElement>()}
      />,
    );
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('Filters1');
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin fields' })).not.toBeInTheDocument();
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    expect(within(sort).getAllByRole('option').map((option) => option.textContent)).toEqual(['ARR', 'Name']);
  });

  it("shows the kind's own filters: Organization, and no Product or Churned", async () => {
    const update = vi.fn();
    inWidgets(
      <FiltersPanel
        params={widgetParams('organisation=7')}
        update={update}
        options={OPTIONS}
        isSm
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('group', { name: 'Organization' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('group', { name: 'Product' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'Include churned' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Pizza Hut' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Globex' }));
    expect(update).toHaveBeenCalledWith({ organisation: ['7', '1'] });
  });

  it("adds in the kind's words from the phone sheet", () => {
    inWidgets(
      <FiltersPanel
        params={widgetParams('')}
        update={vi.fn()}
        options={OPTIONS}
        isSm={false}
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
  });

  it("names an organisation chip and names the filter in the kind's words", () => {
    inWidgets(
      <FilterChips params={widgetParams('organisation=7')} options={OPTIONS} onChange={vi.fn()} onClearAll={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Remove filter: Organization: Pizza Hut' })).toBeInTheDocument();
  });

  it('offers only the actions it is given, and keeps Churn as a stage when asked', () => {
    inWidgets(
      <SelectionBar
        count={2}
        owners={[]}
        lifecycles={[
          { value: 'live', name: 'Live' },
          { value: 'churn', name: 'Churn' },
        ]}
        activity={null}
        report={null}
        onSetOwner={vi.fn()}
        onSetLifecycle={vi.fn()}
        onExport={vi.fn()}
        onClose={vi.fn()}
        keepChurn
      />,
    );
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Churn' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('combobox', { name: 'Set lifecycle' })).getByRole('option', { name: 'Churn' })).toBeInTheDocument();
  });

  it("reports a bulk edit in the kind's words", () => {
    inWidgets(
      <SelectionBar
        count={0}
        owners={[]}
        lifecycles={[]}
        activity={null}
        report={{ updated: 2, failed: [] }}
        onSetOwner={vi.fn()}
        onSetLifecycle={vi.fn()}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Updated 2 widgets.')).toBeInTheDocument();
  });

  it("opens the Renewing tile on the kind's window", () => {
    const data = buildPortfolio(new URLSearchParams());
    inWidgets(<SummaryTiles summary={data.summary} currency="USD" params={widgetParams('')} onFilter={vi.fn()} />);
    expect(screen.getByText('within 90 days, overdue included')).toBeInTheDocument();
  });
});

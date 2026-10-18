import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ALL_COLUMNS } from '../tableData';
import { PANEL_ORDER, PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { ACCOUNTS, stubOrganizationPage } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DetailsTab } from './DetailsTab';
import { HeaderTiles } from './HeaderTiles';
import { OrganizationHeader } from './OrganizationHeader';

// Spec §0: the page used to show fewer fields than the List. With the name
// row, the tiles and the Details tab it shows every one of the 34, once.
// The churned fixture is used because the churn fields show only when churned.
// Accounts render with real items (round-1 fix, 2026-09-27) so an
// AccountsSection regression — like its PulseDots picking up the org row's
// own `data-field="pulse"` — would fail the "renders exactly once" case below.
function renderPage(row: PortfolioRow) {
  stubOrganizationPage({ row });
  return render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <section data-part="header">
          <OrganizationHeader row={row} canEdit onEdit={() => {}} onArchive={() => {}} onChurn={() => {}} onAddAccount={() => {}} />
          <HeaderTiles row={row} customer={null} customerError={null} onJump={() => {}} />
        </section>
        <DetailsTab
          row={row}
          customerId={row.id}
          isSm
          accounts={{ items: ACCOUNTS, loading: false, error: null, onRetry: () => {}, onAdd: () => {}, onEdit: () => {} }}
          customer={null}
          customerError={null}
          onRetryCustomer={() => {}}
          onEdit={() => {}}
        />
      </MemoryRouter>
    </Provider>,
  ).container;
}

describe('the organization page shows the 34 table fields', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('walks the whole list', () => {
    expect(ALL_COLUMNS).toHaveLength(34);
  });

  it.each(ALL_COLUMNS.map((column) => [column.id, column.label] as const))(
    '%s (%s) renders exactly once, in the header or its Details panel',
    (id) => {
      const container = renderPage(initech);
      const found = container.querySelectorAll(`[data-field="${id}"]`);
      expect(found).toHaveLength(1);
      const said = found[0].textContent?.trim() || found[0].getAttribute('aria-label')?.trim();
      expect(said ?? '').not.toBe('');
      const place = PORTFOLIO_FIELDS[id].place;
      if (place === 'header') expect(found[0].closest('[data-part="header"]')).not.toBeNull();
      else expect(found[0].closest(`[data-panel="${place}"]`)).not.toBeNull();
    },
  );

  it('keeps each panel field in its own panel', () => {
    const container = renderPage(initech);
    for (const [panel, ids] of Object.entries(PANEL_ORDER)) {
      const section = container.querySelector(`[data-panel="${panel}"]`) as HTMLElement;
      for (const id of ids) expect(section.querySelector(`[data-field="${id}"]`)).not.toBeNull();
    }
  });

  it('an organization that has not churned shows the other 31', () => {
    const container = renderPage(pizzaHut);
    const shown = ALL_COLUMNS.filter((column) => container.querySelector(`[data-field="${column.id}"]`));
    expect(shown).toHaveLength(31);
    expect(shown.map((column) => column.id)).not.toContain('churnReason');
  });
});

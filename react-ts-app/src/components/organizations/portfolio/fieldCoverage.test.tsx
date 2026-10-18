import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ALL_COLUMNS } from '../tableData';
import { AccountRow } from './AccountRow';
import { AccountDetails } from './AccountDetails';
import { HEADER_FIELDS, PANEL_ORDER, PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import { initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';

// The spec's promise: nothing the old table showed is lost. The churned
// fixture is used because the churn fields only show when churned.
function renderOpened(row: PortfolioRow) {
  return render(
    <MemoryRouter>
      <ul>
        <AccountRow
          row={row}
          currency="USD"
          pins={['nps', 'tcv', 'domain']}
          isSm
          selecting={false}
          selected={false}
          open
          onToggleSelect={() => {}}
          onLongPress={() => {}}
          onToggleOpen={() => {}}
        >
          <AccountDetails row={row} today="2026-09-25" />
        </AccountRow>
      </ul>
    </MemoryRouter>,
  ).container;
}

describe('the 34 table fields', () => {

  it('are the list this test walks', () => {
    expect(ALL_COLUMNS).toHaveLength(34);
  });

  it.each(ALL_COLUMNS.map((column) => [column.id, column.label] as const))(
    '%s (%s) renders exactly once, in the header or the opened row',
    (id) => {
      const container = renderOpened(initech);
      const found = container.querySelectorAll(`[data-field="${id}"]`);
      expect(found).toHaveLength(1);
      // A field shows text, or (the pulse dots) is an image with a spoken name.
      const said = found[0].textContent?.trim() || found[0].getAttribute('aria-label')?.trim();
      expect(said ?? '').not.toBe('');
      const place = PORTFOLIO_FIELDS[id].place;
      if (place === 'header') {
        expect(found[0].closest('[data-part="header"]')).not.toBeNull();
      } else {
        expect(found[0].closest(`[data-panel="${place}"]`)).not.toBeNull();
      }
    },
  );

  it('header fields sit in the header and panel fields in their panel', () => {
    const container = renderOpened(initech);
    const header = container.querySelector('[data-part="header"]') as HTMLElement;
    for (const id of HEADER_FIELDS) expect(header.querySelector(`[data-field="${id}"]`)).not.toBeNull();
    for (const [panel, ids] of Object.entries(PANEL_ORDER)) {
      const section = container.querySelector(`[data-panel="${panel}"]`) as HTMLElement;
      for (const id of ids) expect(section.querySelector(`[data-field="${id}"]`)).not.toBeNull();
    }
  });

  it('an account that has not churned shows the other 31', () => {
    const container = renderOpened(pizzaHut);
    const shown = ALL_COLUMNS.filter((c) => container.querySelector(`[data-field="${c.id}"]`));
    expect(shown).toHaveLength(31);
    expect(shown.map((c) => c.id)).not.toContain('churnReason');
  });
});

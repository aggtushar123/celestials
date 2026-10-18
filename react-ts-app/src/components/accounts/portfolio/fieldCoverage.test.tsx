import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ACCOUNT_FIELDS, type AccountFieldId } from '../../../features/accounts/accountFields';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountRow } from '../../organizations/portfolio/AccountRow';
import { PortfolioKindContext } from '../../organizations/portfolio/portfolioKind';
import { AccountPanels } from './AccountPanels';
import { ACCOUNT_KIND } from './accountKind';

// The spec's promise (§1 "Opened row"): every account field appears exactly
// once, in the row's header or one of the four panels.
function renderOpened(row: AccountPortfolioRow) {
  return render(
    <MemoryRouter>
      <PortfolioKindContext.Provider value={ACCOUNT_KIND}>
        <ul>
          <AccountRow
            row={row}
            currency="USD"
            pins={[]}
            isSm
            selecting={false}
            selected={false}
            open
            onToggleSelect={() => {}}
            onLongPress={() => {}}
            onToggleOpen={() => {}}
          >
            <AccountPanels row={row} currency="USD" today="2026-09-29" />
          </AccountRow>
        </ul>
      </PortfolioKindContext.Provider>
    </MemoryRouter>,
  ).container;
}

const IDS = Object.keys(ACCOUNT_FIELDS) as AccountFieldId[];

describe('the 24 account fields', () => {
  it('are the list this test walks', () => {
    expect(IDS).toHaveLength(24);
  });

  it.each(IDS.map((id) => [id, ACCOUNT_FIELDS[id].label] as const))(
    '%s (%s) renders exactly once, in the header or its panel',
    (id) => {
      const container = renderOpened(pizzaEmea);
      const found = container.querySelectorAll(`[data-field~="${id}"]`);
      expect(found).toHaveLength(1);
      // A field shows text, or (the ring, the pulse dots) is an image with a spoken name.
      const said = found[0].textContent?.trim() || found[0].getAttribute('aria-label')?.trim();
      expect(said ?? '').not.toBe('');
      const place = ACCOUNT_FIELDS[id].place;
      if (place === 'header') {
        expect(found[0].closest('[data-part="header"]')).not.toBeNull();
      } else {
        expect(found[0].closest(`[data-panel="${place}"]`)).not.toBeNull();
      }
    },
  );
});

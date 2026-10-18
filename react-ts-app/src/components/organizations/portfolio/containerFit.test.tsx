import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { parseParams } from '../../../features/organizations/portfolioParams';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import { AccountRow } from './AccountRow';
import { buildPortfolio } from '../../../features/organizations/testPortfolio';
import { SummaryTiles } from './SummaryTiles';

// jsdom applies no CSS: these pin the classes that make the row and the
// tiles follow their content column (which the Ask rail narrows) rather
// than the window. The browser check verifies the layout itself.
describe('fitting the content column', () => {
  it('lets a row wrap until its container is 62rem wide', () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <AccountRow
            row={pizzaHut}
            currency="USD"
            pins={[]}
            isSm
            selecting={false}
            selected={false}
            open={false}
            onToggleSelect={vi.fn()}
            onLongPress={vi.fn()}
            onToggleOpen={vi.fn()}
          />
        </ul>
      </MemoryRouter>,
    );
    const header = container.querySelector('[data-part="header"]');
    expect(header).toHaveClass('flex-wrap', '@min-[62rem]:flex-nowrap');
    expect(header).not.toHaveClass('sm:flex-nowrap');
  });

  it('puts four tiles in a row only when their container is 50rem wide', () => {
    const { container } = render(
      <SummaryTiles summary={buildPortfolio(new URLSearchParams()).summary} failed={false} currency="USD" params={parseParams(new URLSearchParams())} onFilter={vi.fn()} />,
    );
    const grid = container.querySelector('[class*="grid-cols-4"]');
    expect(grid).toHaveClass('@min-[50rem]:grid-cols-4');
    expect(grid).not.toHaveClass('lg:grid-cols-4');
  });
});

import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CS } from '../../features/brain/customersText';
import { COMPANY_CUSTOMERS, TEAM_CUSTOMERS } from '../../features/brain/testCustomersFixtures';
import { AnomalyList, AskList, SeeAll } from './CustomerLists';
import { Figured } from './Figured';

const renderIn = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const monos = (el: Element) => [...el.querySelectorAll('.tabular-nums')].map((s) => s.textContent);

describe('Asks and Anomalies (customers spec §2.1)', () => {
  it('sets every figure in a sentence in tabular figures and leaves the words alone', () => {
    const { container } = render(<Figured text="Planned · $182.0K · 3 companies · 12 asks, up from −7%" />);
    expect(container).toHaveTextContent('Planned · $182.0K · 3 companies · 12 asks, up from −7%');
    expect(monos(container)).toEqual(['$182.0K', '3', '12', '−7%']);
  });

  it('lists the top asks in the server’s order with status, ARR, companies and the trend in words', () => {
    renderIn(<AskList asks={COMPANY_CUSTOMERS.asks.top} scope="company" currency="USD" />);
    const rows = within(screen.getByRole('list', { name: CS.ASKS })).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('[title]')?.textContent)).toEqual(['SSO with Okta', 'CSV export', 'Audit log', 'Slack alerts', 'Dark mode']);
    const meta = rows[0].querySelector('p')!;
    expect(meta).toHaveTextContent('Planned · $182.0K · 3 companies · 12 asks, up from 7');
    expect(monos(meta)).toEqual(['$182.0K', '3', '12', '7']);
  });

  it.each([
    ['me', 'No asks from your customers yet.'],
    ['team', "No asks from your team's customers yet."],
    ['company', 'No asks from customers yet.'],
  ] as const)('says there are no asks in %s', (scope, text) => {
    renderIn(<AskList asks={[]} scope={scope} currency="USD" />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists anomalies under the title the server sent, and says nothing unusual when there are none', () => {
    const { unmount } = renderIn(<AnomalyList anomalies={TEAM_CUSTOMERS.anomalies.top} currency="USD" />);
    const row = within(screen.getByRole('list', { name: CS.ANOMALIES })).getByRole('listitem');
    expect(row).toHaveTextContent('Similar reports across 2 of your companies');
    expect(row.querySelector('p')).toHaveTextContent('Live · $90.0K · 2 companies · last seen 4 Oct');
    unmount();
    renderIn(<AnomalyList anomalies={[]} currency="USD" />);
    expect(screen.getByText(CS.NO_ANOMALIES)).toBeInTheDocument();
  });

  it('says Top 5 of 7 and opens See all on the full page in the same scope', () => {
    renderIn(<SeeAll page="requests" scope="team" shown={5} total={7} />);
    expect(screen.getByText(/Top/)).toHaveTextContent('Top 5 of 7');
    const link = screen.getByRole('link', { name: CS.SEE_ALL_ASKS });
    expect(link).toHaveTextContent(CS.SEE_ALL);
    expect(link).toHaveAttribute('href', '/brain/requests?scope=team');
  });

  it('drops Top N of M when everything shows, and See all when there is nothing', () => {
    const { container, unmount } = renderIn(<SeeAll page="anomalies" scope="me" shown={0} total={0} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    renderIn(<SeeAll page="anomalies" scope="me" shown={1} total={1} />);
    expect(screen.queryByText(/Top/)).toBeNull();
    expect(screen.getByRole('link', { name: CS.SEE_ALL_ANOMALIES })).toHaveAttribute('href', '/brain/anomalies?scope=me');
  });
});

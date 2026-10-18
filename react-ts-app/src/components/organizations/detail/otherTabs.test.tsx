import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import { ACCOUNTS, pizzaHutCustomer, requestPaths, stubOrganizationPage } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DetailsTab } from './DetailsTab';
import { FilesCallsTab } from './FilesCallsTab';
import { KnowledgeTab } from './KnowledgeTab';

const NO_ACCOUNTS = { items: [], loading: false, error: null, onRetry: () => {}, onAdd: () => {}, onEdit: () => {} };
const CUSTOMER = { customer: pizzaHutCustomer, customerError: null, onRetryCustomer: () => {} };

function renderWithStore(ui: ReactNode) {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe('the other tabs in delivery 1', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Details shows the Accounts section, the List's six panels with Edit details, contact and CSAT, then the AI attributes", async () => {
    stubOrganizationPage();
    const onEdit = vi.fn();
    const onEditAccount = vi.fn();
    renderWithStore(
      <DetailsTab row={pizzaHut} customerId={7} isSm accounts={{ ...NO_ACCOUNTS, items: ACCOUNTS, onEdit: onEditAccount }} {...CUSTOMER} onEdit={onEdit} />,
    );
    expect(screen.getByRole('region', { name: 'Accounts' }).compareDocumentPosition(document.querySelector('[data-panel="commercial"]')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit EMEA' }));
    expect(onEditAccount).toHaveBeenCalledWith(ACCOUNTS[0]);
    for (const panel of ['commercial', 'contract', 'adoption', 'voice', 'profile', 'history']) {
      expect(document.querySelector(`[data-panel="${panel}"]`)).not.toBeNull();
    }
    expect(document.querySelector('[data-panel="commercial"]')!.parentElement).toHaveClass('md:grid-cols-2');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledOnce();
    const facts = screen.getByRole('region', { name: 'Contact and CSAT' });
    expect(document.querySelector('[data-panel="history"]')!.compareDocumentPosition(facts)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(facts.compareDocumentPosition(screen.getByRole('region', { name: 'AI attributes' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('Details stacks the panels on phones', () => {
    stubOrganizationPage();
    renderWithStore(<DetailsTab row={pizzaHut} customerId={7} isSm={false} accounts={NO_ACCOUNTS} {...CUSTOMER} />);
    expect(document.querySelector('[data-panel="commercial"]')!.parentElement).not.toHaveClass('md:grid-cols-2');
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });

  it("Knowledge is today's Company View with the headlines below it", async () => {
    const spy = stubOrganizationPage();
    renderWithStore(<KnowledgeTab customerId={7} customerName="Pizza Hut" />);
    expect(screen.getByRole('region', { name: 'Headlines' })).toBeInTheDocument();
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /customers/7/headlines/'));
    expect(requestPaths(spy)).toContain('GET /customers/7/brief/');
  });

  it('Files holds the files and the calls, each read once for the organization', async () => {
    const spy = stubOrganizationPage();
    renderWithStore(<FilesCallsTab customerId={7} account="" accounts={ACCOUNTS} isSm active onCallLogged={() => {}} onShowAll={() => {}} />);
    expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calls' })).toBeInTheDocument();
    await waitFor(() => expect(requestPaths(spy)).toEqual(expect.arrayContaining(['GET /customers/7/files/', 'GET /customers/7/calls/'])));
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/files/')).toHaveLength(1);
  });

  it('Details ends with the Account team', async () => {
    const spy = stubOrganizationPage();
    renderWithStore(<DetailsTab row={pizzaHut} customerId={7} isSm accounts={NO_ACCOUNTS} {...CUSTOMER} />);
    const team = await screen.findByRole('region', { name: 'Account team' });
    expect(screen.getByRole('region', { name: 'AI attributes' }).compareDocumentPosition(team)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await waitFor(() => expect(requestPaths(spy)).toEqual(expect.arrayContaining(['GET /customers/7/responsible/', 'GET /function-heads/'])));
  });
});

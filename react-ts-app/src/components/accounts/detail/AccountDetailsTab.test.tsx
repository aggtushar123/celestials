import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { ACCOUNT_LISTS, stubAccountPage } from '../../../features/accounts/testAccountPage';
import { initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import { requestPaths } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import type { OwnerSummary } from '../../shared/OwnerTile';
import { AccountDetailsTab } from './AccountDetailsTab';

const CARL: OwnerSummary = { id: 2, name: 'Carl CSM', function: 'cs' };

// Plain default destructuring can't distinguish "key omitted" from "key
// explicitly set to undefined" (both trigger the default), but `owner` and
// `onEdit` need that distinction (owner undefined means "not landed yet").
// `in` tells the two apart.
function renderDetails(
  opts: {
    row?: AccountPortfolioRow;
    owner?: OwnerSummary | null | undefined;
    ownerError?: string | null;
    mayChangeOwner?: boolean;
    onEdit?: (() => void) | undefined;
  } = {},
) {
  const row = opts.row ?? (pizzaEmea as AccountPortfolioRow);
  const owner = 'owner' in opts ? opts.owner : CARL;
  const ownerError = opts.ownerError ?? null;
  const mayChangeOwner = opts.mayChangeOwner ?? true;
  const onEdit = 'onEdit' in opts ? opts.onEdit : vi.fn();
  const onSaveOwner = vi.fn(async () => null);
  const onRetryOwner = vi.fn();
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <AccountDetailsTab
          row={row}
          currency="USD"
          isSm
          owner={owner}
          ownerError={ownerError}
          mayChangeOwner={mayChangeOwner}
          onSaveOwner={onSaveOwner}
          onRetryOwner={onRetryOwner}
          onEdit={onEdit}
        />
      </MemoryRouter>
    </Provider>,
  );
  return { onSaveOwner, onEdit, onRetryOwner };
}

describe('AccountDetailsTab (spec 2026-09-29 §2.6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetMembersCache();
  });

  it('shows the owner, the four panels with Edit details, and the AI attributes for this account', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    const { onEdit } = renderDetails();
    const section = screen.getByRole('region', { name: 'Account details' });
    expect(within(section).getByText('Carl CSM · Customer Success')).toBeInTheDocument();
    for (const title of ['Commercial', 'Voice of the customer', 'Profile', 'History']) {
      expect(within(section).getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(section.querySelectorAll('[data-panel]')).toHaveLength(4);
    await userEvent.click(within(section).getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledOnce();
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /attributes/values/'));
    const attributes = spy.mock.calls.map(([input]) => new URL(String(input))).find((url) => url.pathname.endsWith('/attributes/values/'))!;
    expect(attributes.searchParams.get('account')).toBe('12');
  });

  it('shows how the account\'s answered CSAT surveys spread', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails();
    const csat = screen.getByRole('region', { name: 'CSAT responses' });
    expect(await within(csat).findByText('CSAT responses', { selector: 'span' })).toBeInTheDocument();
    expect(csat).toHaveTextContent('2 CSAT responses');
    const bands = within(csat).getByRole('list', { name: 'CSAT responses by band' });
    expect(within(bands).getByText('Very Satisfied').closest('li')).toHaveTextContent('1 · 50%');
    expect(within(bands).getByText('Neutral').closest('li')).toHaveTextContent('1 · 50%');
    expect(requestPaths(spy)).toContain('GET /accounts/12/surveys/');
  });

  it('sends knowledge to each linked organisation the viewer may open', () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails();
    const knowledge = screen.getByRole('region', { name: 'Knowledge' });
    expect(knowledge).toHaveTextContent('Knowledge for this account lives on its organizations\' pages: Pizza Hut, Yum Brands.');
    expect(within(knowledge).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/organizations/7?tab=knowledge',
      '/organizations/9?tab=knowledge',
    ]);
  });

  it('with one organisation names its page; with none it names nothing', () => {
    stubAccountPage();
    renderDetails({ row: { ...pizzaEmea, details: { ...pizzaEmea.details, profile: { ...pizzaEmea.details.profile, organisations: [{ id: 7, name: 'Pizza Hut' }] } } } });
    expect(screen.getByRole('region', { name: 'Knowledge' })).toHaveTextContent('Knowledge for this account lives on Pizza Hut\'s page.');
  });

  it('names no organisation for an account the viewer may open none of', () => {
    stubAccountPage({ row: initechApac });
    renderDetails({ row: initechApac, owner: null });
    const knowledge = screen.getByRole('region', { name: 'Knowledge' });
    expect(knowledge).toHaveTextContent('Company knowledge is kept on organization pages, and there is none for this account that you can open.');
    expect(within(knowledge).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Nobody yet')).toBeInTheDocument();
  });

  it('hands the account over with a note', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    const { onSaveOwner } = renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Hand over' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Alice · Customer Success' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('New account owner'), '1');
    await userEvent.type(screen.getByLabelText('Handover note'), 'Covering while Carl is away');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveOwner).toHaveBeenCalledWith(1, 'Covering while Carl is away');
  });

  it('offers no handover to a viewer who may not', () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails({ mayChangeOwner: false });
    expect(screen.queryByRole('button', { name: 'Hand over' })).not.toBeInTheDocument();
  });

  it('waits for the record: no owner and no Edit details until it lands', () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails({ owner: undefined, onEdit: undefined });
    expect(screen.getByText('Loading the owner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });

  it('shows an inline error with Try again when the record fails to load, instead of loading forever', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    const { onRetryOwner } = renderDetails({ owner: undefined, ownerError: "Could not load this account's record.", onEdit: undefined });
    expect(screen.queryByText('Loading the owner')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Could not load this account's record.");
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetryOwner).toHaveBeenCalledOnce();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import {
  ACCOUNTS,
  ORGANIZATION_LISTS,
  postBodies,
  requestPaths,
  stubOrganizationPage,
  type OrganizationLists,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DealsTab } from './DealsTab';

// The organisation page always names its page with `customerId` (never
// `scope`, the account page's own prop): narrowed here so a partial props
// object can still be spread onto the union `DealsTab` now takes.
type Props = Extract<ComponentProps<typeof DealsTab>, { customerId: number }>;

function ui(props: Partial<Props> = {}) {
  return (
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <DealsTab customerId={7} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} {...props} />
      </MemoryRouter>
    </Provider>
  );
}

function renderDeals(props: Partial<Props> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const onShowAll = vi.fn();
  render(ui({ onShowAll, ...props }));
  return { spy, onShowAll };
}

const deals = () => [...document.querySelectorAll('[data-deal]')].map((el) => el.getAttribute('data-deal'));
const summary = () => document.querySelector('[data-summary]');

describe('Deals & risks (spec 2026-09-27 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the opportunities with a summary line, and switches to the risks', async () => {
    renderDeals();
    expect(screen.getByText('Loading opportunities')).toBeInTheDocument();
    await waitFor(() => expect(deals()).toEqual(['61', '62']));
    expect(summary()).toHaveTextContent('2 opportunities · $1,500.00 pipeline MRR · 1 high priority · 0 closed won');
    expect(screen.getByRole('button', { name: 'Opportunities' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Risks' }));
    expect(deals()).toEqual(['71']);
    expect(summary()).toHaveTextContent('1 risk · $800.00 MRR at risk · 1 high priority · 0 realised');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('narrows to the chosen account; the switch counts follow, and an empty kind offers All', async () => {
    const { onShowAll } = renderDeals({ account: '31' });
    await waitFor(() => expect(deals()).toEqual(['61']));
    await userEvent.click(screen.getByRole('button', { name: 'Risks' }));
    expect(screen.getByText('No risks on EMEA')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('searches titles, and says when nothing matches', async () => {
    renderDeals();
    await waitFor(() => expect(deals()).toHaveLength(2));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search opportunities' }), 'add-on');
    expect(deals()).toEqual(['62']);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search opportunities' }), 'zzz');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search for “add-onzzz”' })).toBeInTheDocument();
  });

  it('opens the edit form on select, and deletes from it', async () => {
    const { spy } = renderDeals();
    await waitFor(() => expect(deals()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: /EMEA seat expansion/ }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA seat expansion' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete EMEA seat expansion?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deals()).toEqual(['62']));
    expect(requestPaths(spy)).toContain('DELETE /opportunities/61/');
  });

  it('adds an opportunity on the chosen account, and a risk too', async () => {
    const { spy } = renderDeals({ account: '31' });
    await waitFor(() => expect(deals()).toEqual(['61']));
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity to EMEA' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Upsell');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Opportunity' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(deals()).toHaveLength(2));
    expect(postBodies(spy, '/customers/7/accounts/31/opportunities/')).toEqual([expect.objectContaining({ title: 'Upsell' })]);

    await userEvent.click(screen.getByRole('button', { name: /^Risks/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add risk to EMEA' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Budget freeze');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Risk' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/customers/7/accounts/31/risks/')).toHaveLength(1));
  });

  it('keeps the board as an option from sm, and lists only on phones', async () => {
    renderDeals();
    await waitFor(() => expect(deals()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByText('Solution Validation')).toBeInTheDocument();
    expect(screen.getByText('EMEA seat expansion')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(deals()).toEqual(['61', '62']);

    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    renderDeals({ isSm: false });
    await waitFor(() => expect(deals()).toHaveLength(2));
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
  });

  it('leaves Closed Lost out of the pipeline MRR, and starts its board column collapsed (pipelines spec §1)', async () => {
    const lost = { ...ORGANIZATION_LISTS.opportunities![1], id: 63, title: 'Lost pilot', mrr: '900.00', stage: 'closed_lost' as const, stage_display: 'Closed Lost' };
    renderDeals({}, { ...ORGANIZATION_LISTS, opportunities: [...ORGANIZATION_LISTS.opportunities!, lost] });
    await waitFor(() => expect(deals()).toEqual(['61', '62', '63']));
    expect(summary()).toHaveTextContent('3 opportunities · $1,500.00 pipeline MRR · 1 high priority · 0 closed won');
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByText('EMEA seat expansion')).toBeInTheDocument();
    expect(screen.queryByText('Lost pilot')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show Closed Lost' }));
    expect(screen.getByText('Lost pilot')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide Closed Lost' }));
    expect(screen.queryByText('Lost pilot')).not.toBeInTheDocument();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (fail && new URL(String(input)).pathname.endsWith('/customers/7/opportunities/')) {
          fail = false;
          return { ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) };
        }
        return spy(input, init);
      }),
    );
    render(ui());
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(deals()).toEqual(['61', '62']));
  });
});

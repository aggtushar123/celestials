import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import {
  ACCOUNTS,
  CALLS,
  ORGANIZATION_LISTS,
  postBodies,
  requestPaths,
  stubOrganizationPage,
  type OrganizationLists,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { CallsSection } from './CallsSection';

// The organisation page always names its page with `customerId` (never
// `scope`, the account page's own prop): narrowed here so a partial props
// object can still be spread onto the union `CallsSection` now takes.
type Props = Extract<ComponentProps<typeof CallsSection>, { customerId: number }>;
const BASE: Props = { customerId: 7, account: '', accounts: ACCOUNTS, isSm: true, active: true, version: 0, onLogged: () => {}, onShowAll: () => {} };

function renderCalls(props: Partial<Props> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const store = makeDetailStore();
  const ui = (extra: Partial<Props> = {}) => (
    <Provider store={store}>
      <MemoryRouter>
        <CallsSection {...BASE} {...props} {...extra} />
      </MemoryRouter>
    </Provider>
  );
  const { rerender } = render(ui());
  return { spy, rerender: (extra: Partial<Props>) => rerender(ui(extra)) };
}

const callIds = () => [...document.querySelectorAll('[data-call]')].map((el) => el.getAttribute('data-call'));
const readsOfCalls = (spy: Parameters<typeof requestPaths>[0]) => requestPaths(spy).filter((path) => path === 'GET /customers/7/calls/').length;

describe('CallsSection (spec 2026-09-27 §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups the calls by day, newest first, under a summary line, with no rail and no inner scroll', async () => {
    renderCalls();
    expect(screen.getByText('Loading calls')).toBeInTheDocument();
    await waitFor(() => expect(callIds()).toEqual(['12', '13']));
    const section = screen.getByRole('region', { name: 'Calls' });
    expect(within(section).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(document.querySelector('[data-summary]')).toHaveTextContent('2 calls · 1 h 15 min on calls · 1 positive · 0 neutral · 1 negative');
    expect(section.querySelector('.overflow-y-auto, .overflow-auto, [data-calls-list]')).toBeNull();
  });

  it('narrows to the chosen account', async () => {
    renderCalls({ account: '31' });
    await waitFor(() => expect(callIds()).toEqual(['13']));
  });

  it('says so when the organization itself has none', async () => {
    renderCalls({ account: 'none' }, { calls: [CALLS[1]] });
    expect(await screen.findByText('No calls on the organization itself')).toBeInTheDocument();
  });

  it('logs a call on the chosen account from the + Add sheet, and tells the page', async () => {
    const onLogged = vi.fn();
    const { spy } = renderCalls({ account: '31', onLogged });
    await waitFor(() => expect(callIds()).toEqual(['13']));
    await userEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    expect(within(dialog).getByText('On EMEA')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Call title' }), 'Pricing follow-up');
    fireEvent.change(within(dialog).getByLabelText('When'), { target: { value: '2026-09-26T12:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log call' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postBodies(spy, '/customers/7/accounts/31/calls/')).toHaveLength(1);
    expect(onLogged).toHaveBeenCalledOnce();
    await waitFor(() => expect(callIds()).toHaveLength(2));
  });

  it('closes the sheet when its tab is hidden', async () => {
    const { rerender } = renderCalls();
    await waitFor(() => expect(callIds()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    expect(screen.getByRole('dialog', { name: 'Log a call' })).toBeInTheDocument();
    rerender({ active: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads again when the page bumps the version (a call logged from the Story)', async () => {
    const { spy, rerender } = renderCalls();
    await waitFor(() => expect(readsOfCalls(spy)).toBe(1));
    rerender({ version: 1 });
    await waitFor(() => expect(readsOfCalls(spy)).toBe(2));
  });
});

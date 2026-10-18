import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fetchContactsForCustomer } from '../../../features/customers/customersSlice';
import { ACCOUNT_LISTS, stubAccountPage } from '../../../features/accounts/testAccountPage';
import type { DetailScope } from '../../../features/organizations/detailScope';
import { postBodies, requestPaths } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { CallsSection } from '../../organizations/detail/CallsSection';
import { DealsTab } from '../../organizations/detail/DealsTab';
import { FilesSection } from '../../organizations/detail/FilesSection';
import { PeopleTab } from '../../organizations/detail/PeopleTab';
import { ShowAccountTags } from '../../organizations/detail/accountNames';

// The organisation page's lists on one account (spec 2026-09-29 §2.7–2.9):
// read by the account alone, no account tags, adds on the account.

const EMEA: DetailScope = { kind: 'account', id: 12, name: 'Pizza EMEA' };
const ids = (attr: string) => [...document.querySelectorAll(`[${attr}]`)].map((el) => el.getAttribute(attr));

function renderOnAccount(ui: ReactNode, store = makeDetailStore()) {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ShowAccountTags.Provider value={false}>{ui}</ShowAccountTags.Provider>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

describe('the lists on one account', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('People reads the account\'s people, with a summary, no account tags, and names that open the person', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<PeopleTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-person')).toEqual(['51', '52', '53']));
    expect(requestPaths(spy)).toContain('GET /accounts/12/contacts/');
    expect(document.querySelector('[data-summary]')).not.toBeNull();
    for (const person of document.querySelectorAll('[data-person]')) expect(person).not.toHaveTextContent('Pizza EMEA');
    expect(screen.getByRole('link', { name: 'Dana Buyer' })).toHaveAttribute('href', '/contacts/51');
  });

  it('People adds a person on the account and reads the list again', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<PeopleTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-person')).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(ids('data-person')).toHaveLength(4));
    expect(postBodies(spy, '/accounts/12/contacts/')).toEqual([expect.objectContaining({ name: 'Robin Ops' })]);
    expect(requestPaths(spy).filter((path) => path === 'GET /accounts/12/contacts/')).toHaveLength(2);
  });

  it('People never shows an organisation\'s people left in the shared slot', async () => {
    const store = makeDetailStore();
    // Another page's read (an organisation's roll-up) lands in the slot first.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ ...ACCOUNT_LISTS.contacts[0], id: 77, name: 'Other Org Person' }] })));
    await store.dispatch(fetchContactsForCustomer(7));
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<PeopleTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />, store);
    expect(screen.queryByText('Other Org Person')).not.toBeInTheDocument();
    await waitFor(() => expect(ids('data-person')).toEqual(['51', '52', '53']));
  });

  it('Deals & risks reads both lists by the account and adds on it', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<DealsTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-deal')).toEqual(['61', '62']));
    expect(requestPaths(spy)).toEqual(expect.arrayContaining(['GET /accounts/12/opportunities/', 'GET /accounts/12/risks/']));
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Upsell');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Opportunity' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(ids('data-deal')).toHaveLength(3));
    expect(postBodies(spy, '/accounts/12/opportunities/')).toEqual([expect.objectContaining({ title: 'Upsell' })]);

    await userEvent.click(screen.getByRole('button', { name: /^Risks/ }));
    await waitFor(() => expect(ids('data-deal')).toEqual(['71']));
    await userEvent.click(screen.getByRole('button', { name: 'Add risk' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Budget freeze');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Risk' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/accounts/12/risks/')).toHaveLength(1));
  });

  it('Files reads the account\'s files and uploads on it', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<FilesSection scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-file')).toEqual(['81', '82']));
    expect(screen.getByText(/New files go on Pizza EMEA\./)).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Choose files'), new File(['x'], 'Notes.txt', { type: 'text/plain' }));
    await waitFor(() => expect(ids('data-file')).toHaveLength(3));
    expect(postBodies(spy, '/accounts/12/files/')).toHaveLength(1);
    const first = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem')[0];
    expect(within(first).getByText('Notes.txt')).toBeInTheDocument();
    expect(first).not.toHaveTextContent('Pizza EMEA');
  });

  it('Files: names no one with a malformed sentence while the account\'s row (and its name) has not landed yet', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    const LOADING: DetailScope = { kind: 'account', id: 12, name: '' };
    renderOnAccount(<FilesSection scope={LOADING} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-file')).toEqual(['81', '82']));
    expect(screen.queryByText(/New files go on \.$/)).not.toBeInTheDocument();
    expect(screen.queryByText('New files go on .')).not.toBeInTheDocument();
  });

  it('Calls: the Log a call sheet names no one with a malformed sentence while the account\'s name has not landed yet', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    const LOADING: DetailScope = { kind: 'account', id: 12, name: '' };
    renderOnAccount(
      <CallsSection scope={LOADING} account="" accounts={[]} isSm active version={0} onLogged={vi.fn()} onShowAll={vi.fn()} />,
    );
    await waitFor(() => expect(ids('data-call')).toEqual(['12', '13']));
    await userEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    // Not "On " with nothing (or just trailing whitespace) after it.
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    const description = document.getElementById(dialog.getAttribute('aria-describedby')!);
    expect(description?.textContent?.trim()).not.toBe('On');
    expect(description?.textContent).toMatch(/^On \S/);
  });

  it('Calls reads the account\'s calls and logs one on it', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    const onLogged = vi.fn();
    renderOnAccount(
      <CallsSection scope={EMEA} account="" accounts={[]} isSm active version={0} onLogged={onLogged} onShowAll={vi.fn()} />,
    );
    await waitFor(() => expect(ids('data-call')).toEqual(['12', '13']));
    await userEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    expect(within(dialog).getByText('On Pizza EMEA')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Call title' }), 'Pricing follow-up');
    fireEvent.change(within(dialog).getByLabelText('When'), { target: { value: '2026-09-26T12:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log call' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/accounts/12/calls/')).toHaveLength(1);
    await waitFor(() => expect(ids('data-call')).toHaveLength(3));
  });
});

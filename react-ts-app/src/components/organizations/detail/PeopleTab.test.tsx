import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import {
  ACCOUNTS,
  CONTACTS,
  ORGANIZATION_LISTS,
  postBodies,
  requestPaths,
  stubOrganizationPage,
  type OrganizationLists,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { PeopleTab } from './PeopleTab';

// The organisation page always names its page with `customerId` (never
// `scope`, the account page's own prop): narrowed here so a partial props
// object can still be spread onto the union `PeopleTab` now takes.
type Props = Extract<ComponentProps<typeof PeopleTab>, { customerId: number }>;

function ui(props: Partial<Props> = {}) {
  return (
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <PeopleTab customerId={7} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} {...props} />
      </MemoryRouter>
    </Provider>
  );
}

function renderPeople(props: Partial<Props> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const onShowAll = vi.fn();
  render(ui({ onShowAll, ...props }));
  return { spy, onShowAll };
}

const people = () => [...document.querySelectorAll('[data-person]')].map((el) => el.getAttribute('data-person'));
const summary = () => document.querySelector('[data-summary]');

describe('People (spec 2026-09-27 §2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists every person with a one-line summary in place of the stat cards, read once', async () => {
    const { spy } = renderPeople();
    expect(screen.getByText('Loading people')).toBeInTheDocument();
    await waitFor(() => expect(people()).toEqual(['51', '52', '53']));
    expect(summary()).toHaveTextContent('3 people · 1 decision maker · 2 active · 33% positive sentiment');
    expect(screen.queryByText('Total Contacts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /filter|download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/contacts/')).toHaveLength(1);
  });

  it('narrows to the chosen account, and the summary follows', async () => {
    renderPeople({ account: '31' });
    await waitFor(() => expect(people()).toEqual(['51']));
    expect(summary()).toHaveTextContent('1 person · 1 decision maker · 1 active · 100% positive sentiment');
  });

  it('narrows to the people on the organization itself', async () => {
    renderPeople({ account: 'none' });
    await waitFor(() => expect(people()).toEqual(['53']));
  });

  it('searches by name, role or email, and says when nothing matches', async () => {
    renderPeople();
    await waitFor(() => expect(people()).toHaveLength(3));
    const box = screen.getByRole('searchbox', { name: 'Search people' });
    await userEvent.type(box, 'technical');
    expect(people()).toEqual(['52']);
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getByText('Nothing matches “zzz”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search for “zzz”' }));
    expect(people()).toHaveLength(3);
  });

  it('adds a person on the chosen account, then reads the list again', async () => {
    const { spy } = renderPeople({ account: '31' });
    await waitFor(() => expect(people()).toEqual(['51']));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact to EMEA' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    expect(await screen.findByRole('link', { name: 'Robin Ops' })).toBeInTheDocument();
    expect(postBodies(spy, '/customers/7/accounts/31/contacts/')).toEqual([expect.objectContaining({ name: 'Robin Ops' })]);
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/contacts/')).toHaveLength(2);
  });

  it('keeps the people in place while the list reads again after an add', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    let reads = 0;
    let answer: () => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'GET' && new URL(String(input)).pathname.endsWith('/customers/7/contacts/')) {
          reads += 1;
          if (reads === 2) await new Promise<void>((resolve) => (answer = resolve));
        }
        return spy(input, init);
      }),
    );
    render(ui());
    await waitFor(() => expect(people()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(reads).toBe(2));
    expect(people()).toEqual(['51', '52', '53']);
    expect(screen.queryByText('No people yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading people')).not.toBeInTheDocument();
    answer();
    await waitFor(() => expect(people()).toHaveLength(4));
  });

  it("tags each person with the account's current name, after a rename too", async () => {
    renderPeople({ accounts: ACCOUNTS.map((a) => (a.id === 31 ? { ...a, name: 'EMEA West' } : a)) });
    await waitFor(() => expect(people()).toHaveLength(3));
    const dana = document.querySelector('[data-person="51"]') as HTMLElement;
    expect(within(dana).getByText('EMEA West')).toBeInTheDocument();
    expect(within(dana).queryByText('EMEA')).not.toBeInTheDocument();
  });

  it('adds on the organization under All', async () => {
    const { spy } = renderPeople();
    await waitFor(() => expect(people()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/customers/7/contacts/')).toHaveLength(1));
  });

  it('edits and deletes through ⋯ with the existing flows', async () => {
    const { spy } = renderPeople();
    await waitFor(() => expect(people()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Pat Finance' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Pat Treasurer');
    // Email is required on the form, and Pat has none yet.
    await userEvent.type(screen.getByRole('textbox', { name: /^Email/ }), 'pat@pizzahut.example');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('link', { name: 'Pat Treasurer' })).toBeInTheDocument();
    expect(requestPaths(spy)).toContain('PATCH /contacts/53/');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Pat Treasurer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete Pat Treasurer?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(people()).toEqual(['51', '52']));
    expect(requestPaths(spy)).toContain('DELETE /contacts/53/');
  });

  it('designs its empty states: nobody yet, and nobody on the chosen account', async () => {
    renderPeople({}, {});
    expect(await screen.findByText('No people yet')).toBeInTheDocument();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    const { onShowAll } = renderPeople({ account: '32' }, { contacts: [CONTACTS[0]] });
    expect(await screen.findByText('No people on North America')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (fail && new URL(String(input)).pathname.endsWith('/customers/7/contacts/')) {
          fail = false;
          return { ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) };
        }
        return spy(input, init);
      }),
    );
    render(ui());
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(people()).toEqual(['51', '52', '53']));
  });
});

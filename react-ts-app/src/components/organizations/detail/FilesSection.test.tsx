import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { FilesSection } from './FilesSection';

// The organisation page always names its page with `customerId` (never
// `scope`, the account page's own prop): narrowed here so a partial props
// object can still be spread onto the union `FilesSection` now takes.
type Props = Extract<ComponentProps<typeof FilesSection>, { customerId: number }>;

function ui(props: Partial<Props> = {}) {
  return (
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <FilesSection customerId={7} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} {...props} />
      </MemoryRouter>
    </Provider>
  );
}

function renderFiles(props: Partial<Props> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const onShowAll = vi.fn();
  render(ui({ onShowAll, ...props }));
  return { spy, onShowAll };
}

const fileIds = () => [...document.querySelectorAll('[data-file]')].map((el) => el.getAttribute('data-file'));
const note = () => new File(['x'], 'Notes.txt', { type: 'text/plain' });

describe('FilesSection (spec 2026-09-27 §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the organization's files and every visible account's, each account's tagged, read once", async () => {
    const { spy } = renderFiles();
    expect(screen.getByText('Loading files')).toBeInTheDocument();
    await waitFor(() => expect(fileIds()).toEqual(['81', '82']));
    const [order, deck] = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem');
    expect(within(order).getByText('EMEA')).toBeInTheDocument();
    expect(within(deck).queryByText('Organization')).toBeNull();
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/files/')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Files' }).querySelector('.overflow-y-auto, .overflow-auto')).toBeNull();
  });

  it('shows the drop on the card itself, and clears it on leave', async () => {
    renderFiles();
    await waitFor(() => expect(fileIds()).toEqual(['81', '82']));
    const section = screen.getByRole('region', { name: 'Files' });
    const card = within(section).getByRole('list', { name: 'Files' }).parentElement!;
    expect(card).not.toHaveClass('ring-accent');
    fireEvent.dragOver(section);
    expect(card).toHaveClass('ring-2', 'ring-accent', 'bg-subtle');
    fireEvent.dragLeave(section);
    expect(card).not.toHaveClass('ring-accent');
  });

  it("tags each file with the account's current name, after a rename too", async () => {
    renderFiles({ accounts: ACCOUNTS.map((a) => (a.id === 31 ? { ...a, name: 'EMEA West' } : a)) });
    await waitFor(() => expect(fileIds()).toEqual(['81', '82']));
    const [order] = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem');
    expect(within(order).getByText('EMEA West')).toBeInTheDocument();
  });

  it('narrows to the chosen account, and to the organization itself', async () => {
    renderFiles({ account: '31' });
    await waitFor(() => expect(fileIds()).toEqual(['81']));
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    renderFiles({ account: 'none' });
    await waitFor(() => expect(fileIds()).toEqual(['82']));
  });

  it('says so when the chosen account has none, and offers All', async () => {
    const { onShowAll } = renderFiles({ account: '32' });
    expect(await screen.findByText('No files on North America')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('uploads on the chosen account with its description, and lists the file first', async () => {
    const { spy } = renderFiles({ account: '31' });
    await waitFor(() => expect(fileIds()).toEqual(['81']));
    expect(screen.getByText(/New files go on EMEA\./)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Kick-off notes');
    await userEvent.upload(screen.getByLabelText('Choose files'), note());
    await waitFor(() => expect(fileIds()).toHaveLength(2));
    expect(postBodies(spy, '/customers/7/accounts/31/files/')).toEqual([expect.objectContaining({ description: 'Kick-off notes' })]);
    const first = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem')[0];
    expect(within(first).getByText('Notes.txt')).toBeInTheDocument();
    expect(within(first).getByText('EMEA')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('');
  });

  it('uploads on the organization under All', async () => {
    const { spy } = renderFiles();
    await waitFor(() => expect(fileIds()).toHaveLength(2));
    expect(screen.getByText(/New files go on the organization\./)).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Choose files'), note());
    await waitFor(() => expect(postBodies(spy, '/customers/7/files/')).toHaveLength(1));
  });

  it('deletes after a confirm', async () => {
    const { spy } = renderFiles();
    await waitFor(() => expect(fileIds()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Delete QBR deck.pptx' }));
    expect(screen.getByText('Delete QBR deck.pptx?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(fileIds()).toEqual(['81']));
    expect(requestPaths(spy)).toContain('DELETE /files/82/');
  });

  it('says when a download fails', async () => {
    renderFiles();
    await userEvent.click(await screen.findByRole('button', { name: 'Order form.pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download Order form.pdf.');
  });

  it('says there are none yet under All', async () => {
    renderFiles({}, {});
    expect(await screen.findByText('No files yet')).toBeInTheDocument();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (fail && new URL(String(input)).pathname.endsWith('/customers/7/files/')) {
          fail = false;
          return { ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) };
        }
        return spy(input, init);
      }),
    );
    render(ui());
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fileIds()).toEqual(['81', '82']));
  });
});

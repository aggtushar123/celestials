import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import userManagementReducer from '../../features/userManagement/userManagementSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { GeneralSettingsPage } from './GeneralSettingsPage';

// Integration tier (see the `testing` skill): the real auth and user
// management slices, the fetch boundary mocked. The page reads /auth/me/ on
// mount, the owner's picker reads /auth/users/, a transfer POSTs
// /auth/organisation/owner/ and reads /auth/me/ again.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ALICE_OWNS = { id: 1, name: 'Alice Owner', email: 'alice@acme.io' };
const BOB_OWNS = { id: 2, name: 'Bob Builder', email: 'bob@acme.io' };

function person(overrides: Partial<User> = {}): User {
  return {
    id: 1, email: 'alice@acme.io', name: 'Alice Owner', avatar: '', role: 'admin', role_id: 1, role_name: 'Admin',
    permissions: ALL_CAPABILITIES, function: 'cs', function_display: 'Customer Success', reports_to: null,
    organisation: {
      id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD', currency_display: 'US Dollar ($)',
      default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional', ai_agent_tone_display: 'Professional',
      owner: ALICE_OWNS,
    },
    is_active: true,
    ...overrides,
  };
}

const alice = person({ is_owner: true });
const bob = person({ id: 2, email: 'bob@acme.io', name: 'Bob Builder' });
const carl = person({ id: 3, email: 'carl@acme.io', name: 'Carl Gone', is_active: false });

function renderPage(user: User) {
  const store = configureStore({
    reducer: { auth: authReducer, userManagement: userManagementReducer },
    preloadedState: {
      auth: { user, accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null },
    },
  });
  render(
    <Provider store={store}>
      <GeneralSettingsPage />
    </Provider>,
  );
}

/** `me` answers /auth/me/ each time it is read; `transfer` answers the POST. */
function stubServer(
  me: () => User | { status: number; body: unknown },
  transfer = () => jsonResponse(200, { owner: { id: 2, name: 'Bob Builder' } }),
  users = () => jsonResponse(200, { count: 3, next: null, previous: null, results: [alice, bob, carl] }),
) {
  const fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (url.endsWith('/auth/me/')) {
      const answer = me();
      return Promise.resolve('status' in answer && 'body' in answer ? jsonResponse(answer.status, answer.body) : jsonResponse(200, answer));
    }
    if (url.endsWith('/auth/users/')) return Promise.resolve(users());
    if (url.endsWith('/auth/organisation/owner/') && options?.method === 'POST') return Promise.resolve(transfer());
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('GeneralSettingsPage (settings spec 2026-10-06 §3.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the workspace name, its slug in mono, and the owner', async () => {
    stubServer(() => alice);
    renderPage(alice);
    expect(screen.getByRole('heading', { level: 1, name: 'General' })).toBeInTheDocument();
    expect(screen.getByText('Acme Inc')).toBeInTheDocument();
    expect(screen.getByText('acme-inc')).toHaveClass('font-mono-brand');
    expect(screen.getAllByText('Alice Owner').length).toBeGreaterThan(0);
    await screen.findByRole('option', { name: 'Bob Builder' });
  });

  it('gives the owner a picker of active members other than themselves', async () => {
    stubServer(() => alice);
    renderPage(alice);
    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    expect(within(picker).queryByRole('option', { name: 'Alice Owner' })).toBeNull();
    expect(within(picker).queryByRole('option', { name: 'Carl Gone' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Transfer ownership' })).toBeDisabled();
  });

  it('confirms, posts the chosen user_id, then reads /auth/me/ again so is_owner flips', async () => {
    let owner = ALICE_OWNS;
    const fetchMock = stubServer(
      () => (owner.id === 1 ? alice : person({ is_owner: false, organisation: { ...alice.organisation, owner: BOB_OWNS } })),
      () => {
        owner = BOB_OWNS;
        return jsonResponse(200, { owner: { id: 2, name: 'Bob Builder' } });
      },
    );
    const user = userEvent.setup();
    renderPage(alice);

    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    await user.selectOptions(picker, 'Bob Builder');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));

    const dialog = screen.getByRole('dialog', { name: 'Transfer ownership to Bob Builder?' });
    expect(dialog).toHaveTextContent("You keep your role but lose the owner's rights.");
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }));

    expect(await screen.findByText('Only the owner, Bob Builder, can hand the workspace on.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'New owner' })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Danger zone' })).getByRole('status')).toHaveTextContent('Ownership passed to Bob Builder.');
    // The Transfer button unmounted, so focus lands on the section heading.
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Danger zone' })).toHaveFocus());

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ user_id: 2 });
    const postAt = urls.findIndex((url) => url.endsWith('/auth/organisation/owner/'));
    expect(urls.slice(postAt + 1).some((url) => url.endsWith('/auth/me/'))).toBe(true);
  });

  it("shows the server's message below the picker when the transfer is refused", async () => {
    stubServer(
      () => alice,
      () => jsonResponse(400, { success: false, error: { code: 'NOT_A_MEMBER', message: 'The new owner must be an active member.' } }),
    );
    const user = userEvent.setup();
    renderPage(alice);

    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    await user.selectOptions(picker, 'Bob Builder');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The new owner must be an active member.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('combobox', { name: 'New owner' })).toBeInTheDocument();
  });

  it('tells a non-owner who owns the workspace, with no picker and no members fetch', async () => {
    const csm = person({ id: 3, name: 'Carl CSM', email: 'carl@acme.io', permissions: [], is_owner: false });
    const fetchMock = stubServer(() => csm);
    renderPage(csm);

    expect(screen.getByText('Only the owner, Alice Owner, can hand the workspace on.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'New owner' })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/users/'))).toBe(false);
  });

  it('shows the owner the picker straight away when the login payload has no is_owner', async () => {
    // The login payload carries no is_owner; /auth/me/ failing must not hide the picker.
    const fromLogin = person();
    expect(fromLogin.is_owner).toBeUndefined();
    stubServer(() => ({ status: 500, body: { detail: 'down' } }));
    renderPage(fromLogin);

    const picker = screen.getByRole('combobox', { name: 'New owner' });
    expect(screen.queryByText(/can hand the workspace on/)).toBeNull();
    await within(picker).findByRole('option', { name: 'Bob Builder' });
  });

  it('says so below the picker when the members cannot be loaded', async () => {
    stubServer(
      () => alice,
      undefined,
      () => jsonResponse(500, { success: false, error: { code: 'SERVER', message: 'boom' } }),
    );
    renderPage(alice);

    expect(await screen.findByText('Could not load members.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'New owner' })).toBeInTheDocument();
  });
});

describe('General on the settings frame (UI foundations spec §6.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('heads the page from the nav and shows the workspace as rows, the slug as code', async () => {
    stubServer(() => alice);
    renderPage(alice);
    expect(screen.getByRole('heading', { level: 1, name: 'General' })).toHaveClass('text-[22px]', 'font-semibold');
    const workspace = screen.getByRole('region', { name: 'Workspace' });
    expect(within(workspace).getByText('acme-inc')).toHaveClass('font-mono-brand');
    expect(within(workspace).getByText('Name')).toHaveClass('text-[13px]', 'font-semibold');
    await screen.findByRole('option', { name: 'Bob Builder' });
  });

  it('puts the ownership transfer under a Danger zone heading', () => {
    stubServer(() => alice);
    renderPage(alice);
    expect(screen.getByRole('heading', { level: 2, name: 'Danger zone' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ownership' })).toBeNull();
  });

  it('keeps the ownership status region one node while the transfer turns the owner into a member', async () => {
    let owner = ALICE_OWNS;
    stubServer(
      () => (owner.id === 1 ? alice : person({ is_owner: false, organisation: { ...alice.organisation, owner: BOB_OWNS } })),
      () => {
        owner = BOB_OWNS;
        return jsonResponse(200, { owner: { id: 2, name: 'Bob Builder' } });
      },
    );
    const user = userEvent.setup();
    renderPage(alice);
    const ownership = screen.getByRole('region', { name: 'Danger zone' });
    const region = within(ownership).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    await user.selectOptions(picker, 'Bob Builder');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' }));
    await waitFor(() => expect(region).toHaveTextContent('Ownership passed to Bob Builder.'));
    expect(within(screen.getByRole('region', { name: 'Danger zone' })).getByRole('status')).toBe(region);
    expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull();
  });
});

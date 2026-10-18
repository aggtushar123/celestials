import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userManagementReducer from '../../features/userManagement/userManagementSlice';
import authReducer from '../../features/auth/authSlice';
import { makeDetailStore } from '../organizations/testDetail';
import { NO_HEADS } from '../../features/knowledge/testHeads';
import { UserManagement } from './UserManagement';

// Integration tier (see the `testing` skill): no auth slice needed —
// the page itself isn't gated (RequireCapability in App.tsx and the
// Sidebar do that, each with their own tests), so only the fetch
// boundary is mocked. The page loads three endpoints on mount:
// /auth/users/, /auth/roles/ and /auth/capabilities/.

const alice = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice Admin',
  avatar: 'https://i.pravatar.cc/150?u=alice@acme.io',
  role: 'admin' as const,
  role_id: 1,
  role_name: 'Admin',
  permissions: ['manage_users'],
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc' },
  is_active: true,
};

const carl = {
  id: 2,
  email: 'carl@acme.io',
  name: 'Carl CSM',
  avatar: 'https://i.pravatar.cc/150?u=carl@acme.io',
  role: 'csm' as const,
  role_id: 2,
  role_name: 'CSM',
  permissions: [],
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc' },
  is_active: true,
};

const adminRole = {
  id: 1,
  name: 'Admin',
  slug: 'admin',
  permissions: ['manage_users', 'manage_integrations'],
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  is_system: true,
  users_count: 1,
  created_at: '2026-09-07T00:00:00Z',
};

const csmRole = {
  id: 2,
  name: 'CSM',
  slug: 'csm',
  permissions: [],
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  is_system: true,
  users_count: 1,
  created_at: '2026-09-07T00:00:00Z',
};

const capabilities = [
  { key: 'manage_users', label: 'Manage users & roles' },
  { key: 'manage_integrations', label: 'Manage integrations & webhooks' },
];

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Routes each of the page's three mount-time GETs to the right shape —
 * roles/capabilities are plain arrays, members is paginated. */
function stubFetch(
  handler?: (url: string, options?: RequestInit) => ReturnType<typeof jsonResponse> | undefined
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) => {
      const custom = handler?.(url, options);
      if (custom) return Promise.resolve(custom);
      if (url.includes('/function-heads/')) return Promise.resolve(jsonResponse(200, NO_HEADS));
      if (url.includes('/auth/capabilities/')) return Promise.resolve(jsonResponse(200, capabilities));
      if (url.includes('/auth/roles/')) return Promise.resolve(jsonResponse(200, [adminRole, csmRole]));
      return Promise.resolve(
        jsonResponse(200, { count: 2, next: null, previous: null, results: [alice, carl] })
      );
    })
  );
}

function renderPage() {
  const store = configureStore({ reducer: { userManagement: userManagementReducer, auth: authReducer }, preloadedState: { auth: makeDetailStore().getState().auth } });
  render(
    <Provider store={store}>
      <UserManagement />
    </Provider>
  );
}

describe('UserManagement page', () => {
  it('shows the department heads under the members', async () => {
    stubFetch();
    renderPage();
    expect(await screen.findByRole('region', { name: 'Department heads' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Members' }).compareDocumentPosition(screen.getByRole('region', { name: 'Department heads' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists every member on mount, admins included', async () => {
    // The old CSM-only list couldn't show an admin at all — not even
    // the person looking at the page.
    stubFetch();
    renderPage();

    expect(await screen.findAllByText('Alice Admin').then((els) => els[0])).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'People & teams' })).toHaveClass('text-[22px]', 'font-semibold');
    expect(screen.getAllByText('Carl CSM')[0]).toBeInTheDocument();
    expect(screen.getByText('alice@acme.io')).toBeInTheDocument();
    // A narrow frame scrolls the table inside its card rather than clipping it.
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto');
  });

  it('keeps the page in the wide settings frame, the table flush in its card with the house cells (UI broken-things fix 4)', async () => {
    stubFetch();
    renderPage();
    await screen.findAllByText('Carl CSM');
    const heading = screen.getByRole('heading', { level: 1, name: 'People & teams' });
    const frame = heading.closest('.max-w-\\[960px\\]')!;
    expect(frame).toHaveClass('w-full');
    expect(frame).not.toHaveClass('mx-auto');
    const table = screen.getByRole('table');
    expect(table.closest('.rounded-xl')).not.toBeNull();
    for (const header of within(table).getAllByRole('columnheader')) {
      expect(header).toHaveClass('px-4', 'text-[11px]', 'font-semibold');
      expect(header.className).not.toMatch(/uppercase/);
    }
    expect(screen.getByTitle('carl@acme.io')).toHaveClass('max-w-[16rem]', 'truncate');
  });

  it('switches Members, Roles and Access with tabs under the heading', async () => {
    stubFetch();
    renderPage();
    const tabs = screen.getByRole('tablist', { name: 'People sections' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Members', 'Roles', 'Access']);
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Roles' }));
    expect(within(tabs).getByRole('tab', { name: 'Roles' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', within(tabs).getByRole('tab', { name: 'Roles' }).id);
    expect(screen.queryByRole('button', { name: 'Add team member' })).toBeNull();
  });

  it('shows a deactivated member as a neutral badge, never red, and active as plain words', async () => {
    stubFetch((_url, options) => (options?.method === 'PATCH' ? jsonResponse(200, { ...carl, is_active: false }) : undefined));
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    expect(within(screen.getByRole('table')).getAllByText('Active')[0]).not.toHaveClass('bg-success-dim');
    await user.click(screen.getByRole('button', { name: 'Actions for Carl CSM' }));
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Deactivate Carl CSM?' })).getByRole('button', { name: 'Deactivate' }));
    const badge = (await screen.findAllByText('Deactivated'))[0];
    expect(badge).toHaveClass('bg-subtle', 'text-ink-muted');
  });

  it('adds a member in a trapped dialog: labels above, the short password marked on its field', async () => {
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    await user.click(screen.getByRole('button', { name: 'Add team member' }));
    const dialog = screen.getByRole('dialog', { name: 'Add team member' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'Dana New');
    await user.type(within(dialog).getByLabelText('Email'), 'dana@acme.io');
    await user.type(within(dialog).getByLabelText('Temporary password'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Add member' }));
    const password = within(dialog).getByLabelText('Temporary password');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription(/Password must be at least 8 characters\./);
  });

  it('Add team member: focus starts on the first field and returns to the opener on Escape, Cancel and success', async () => {
    stubFetch((_url, options) => (options?.method === 'POST' ? jsonResponse(201, { ...carl, id: 3, email: 'dana@acme.io', name: 'Dana New' }) : undefined));
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    const opener = screen.getByRole('button', { name: 'Add team member' });
    await user.click(opener);
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(opener).toHaveFocus();
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Add team member' });
    await user.type(within(dialog).getByLabelText('Name'), 'Dana New');
    await user.type(within(dialog).getByLabelText('Email'), 'dana@acme.io');
    await user.type(within(dialog).getByLabelText('Temporary password'), 'danapassword1');
    await user.click(within(dialog).getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener).toHaveFocus();
  });

  it('a submit with the required fields empty does nothing (aria-disabled returns early)', async () => {
    const fetchMock = vi.fn();
    stubFetch((url, options) => {
      fetchMock(url, options);
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    await user.click(screen.getByRole('button', { name: 'Add team member' }));
    const submit = screen.getByRole('button', { name: 'Add member' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    await user.click(submit);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Add team member' })).toBeInTheDocument();
  });

  it('Edit: focus starts on the name and returns to the row menu on cancel and on save', async () => {
    stubFetch((_url, options) => (options?.method === 'PATCH' ? jsonResponse(200, { ...carl, name: 'Carl Renamed' }) : undefined));
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    const more = screen.getByRole('button', { name: 'Actions for Carl CSM' });
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(more).toHaveFocus();
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    await user.type(screen.getByLabelText('Name'), ' X');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: /^Actions for Carl/ })).toHaveFocus();
  });

  it('renders the Deactivate dialog outside the table, so the right-aligned cell cannot align it', async () => {
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    await user.click(screen.getByRole('button', { name: 'Actions for Carl CSM' }));
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    expect(screen.getByRole('table').contains(screen.getByRole('dialog'))).toBe(false);
  });

  it('keeps the browser from autofilling the admin password into the member dialogs', async () => {
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    await user.click(screen.getByRole('button', { name: 'Add team member' }));
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Temporary password')).toHaveAttribute('autocomplete', 'new-password');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Actions for Carl CSM' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Reset password (optional)')).toHaveAttribute('autocomplete', 'new-password');
  });

  it('shows Deactivated beside the name below sm, and only there', async () => {
    stubFetch((url) => (url.includes('/auth/users/') && !url.includes('/auth/users/2/') ? jsonResponse(200, { count: 2, next: null, previous: null, results: [alice, { ...carl, is_active: false }] }) : undefined));
    renderPage();
    await screen.findAllByText('Carl CSM');
    const row = screen.getByRole('button', { name: 'Actions for Carl CSM' }).closest('tr')!;
    const narrow = row.querySelector('[data-narrow-only]') as HTMLElement;
    expect(narrow).toHaveClass('sm:hidden');
    expect(within(narrow).getByText('Deactivated')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'Actions for Alice Admin' }).closest('tr')!).queryByText('Deactivated')).toBeNull();
  });

  it('Deactivate asks first: Cancel changes nothing and focus returns to the row menu', async () => {
    const fetchMock = vi.fn();
    stubFetch((url, options) => {
      fetchMock(url, options);
      return undefined;
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    const more = screen.getByRole('button', { name: 'Actions for Carl CSM' });
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    const dialog = screen.getByRole('dialog', { name: 'Deactivate Carl CSM?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(more).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
  });

  it('after Deactivate is confirmed, focus lands on that row menu', async () => {
    stubFetch((_url, options) => (options?.method === 'PATCH' ? jsonResponse(200, { ...carl, is_active: false }) : undefined));
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    await user.click(screen.getByRole('button', { name: 'Actions for Carl CSM' }));
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    await screen.findAllByText('Deactivated');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Carl CSM' })).toHaveFocus());
  });

  it('shows each member’s real role in an inline picker', async () => {
    stubFetch();
    renderPage();

    const picker = (await screen.findByLabelText('Role for Carl CSM')) as HTMLSelectElement;
    expect(picker.value).toBe('2');
    expect(screen.getByLabelText('Role for Alice Admin')).toHaveValue('1');
  });

  it('changing someone’s role PATCHes their real role_id', async () => {
    const fetchMock = vi.fn();
    stubFetch((url, options) => {
      fetchMock(url, options);
      if (options?.method === 'PATCH') return jsonResponse(200, { ...carl, role_id: 1, role_name: 'Admin', role: 'admin' });
      return undefined;
    });
    const user = userEvent.setup();

    renderPage();
    await user.selectOptions(await screen.findByLabelText('Role for Carl CSM'), '1');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/users/2/'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role_id: 1 }) })
      )
    );
  });

  it('surfaces the backend’s last-user-manager guardrail instead of failing silently', async () => {
    stubFetch((_url, options) =>
      options?.method === 'PATCH'
        ? jsonResponse(400, {
            detail: 'This is the only person who can manage users — give someone else that permission first.',
          })
        : undefined
    );
    const user = userEvent.setup();

    renderPage();
    await user.selectOptions(await screen.findByLabelText('Role for Alice Admin'), '2');

    expect(await screen.findByText(/only person who can manage users/)).toBeInTheDocument();
  });

  it('adds a team member, in a chosen role, through the modal', async () => {
    const fetchMock = vi.fn();
    stubFetch((url, options) => {
      fetchMock(url, options);
      if (options?.method === 'POST') {
        return jsonResponse(201, { ...carl, id: 3, email: 'dana@acme.io', name: 'Dana New' });
      }
      return undefined;
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findAllByText('Carl CSM').then((els) => els[0]);

    await user.click(screen.getByRole('button', { name: 'Add team member' }));
    await user.type(screen.getByLabelText('Name'), 'Dana New');
    await user.type(screen.getByLabelText('Email'), 'dana@acme.io');
    await user.selectOptions(screen.getByLabelText('Role'), '1');
    await user.type(screen.getByLabelText('Temporary password'), 'danapassword1');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect((await screen.findAllByText('Dana New'))[0]).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/users/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Dana New',
            email: 'dana@acme.io',
            password: 'danapassword1',
            function: 'cs',
            role_id: 1,
          }),
        })
      )
    );
  });

  it('deactivates a member from the row action', async () => {
    stubFetch((_url, options) =>
      options?.method === 'PATCH' ? jsonResponse(200, { ...carl, is_active: false }) : undefined
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findAllByText('Carl CSM').then((els) => els[0]);

    await user.click(screen.getByRole('button', { name: 'Actions for Carl CSM' }));
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));

    expect((await screen.findAllByText('Deactivated'))[0]).toBeInTheDocument();
  });

  it('edits a member through the modal', async () => {
    stubFetch((_url, options) =>
      options?.method === 'PATCH' ? jsonResponse(200, { ...carl, name: 'Carl Renamed' }) : undefined
    );
    const user = userEvent.setup();

    renderPage();
    await screen.findAllByText('Carl CSM').then((els) => els[0]);

    await user.click(screen.getByRole('button', { name: 'Actions for Carl CSM' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByRole('dialog', { name: 'Edit Carl CSM' })).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Carl Renamed');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect((await screen.findAllByText('Carl Renamed'))[0]).toBeInTheDocument();
  });
});

describe('UserManagement page — Roles tab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  async function openRolesTab() {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM').then((els) => els[0]);
    await user.click(screen.getByRole('tab', { name: 'Roles' }));
    return user;
  }

  it('lists the org’s roles with their real capabilities ticked', async () => {
    stubFetch();
    await openRolesTab();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('CSM')).toBeInTheDocument();
    // Admin holds manage_users + manage_integrations in this fixture.
    const adminChecks = screen.getAllByRole('checkbox');
    expect(adminChecks[0]).toBeChecked();
    expect(adminChecks[1]).toBeChecked();
  });

  it('marks the built-in roles as such and offers no delete for them', async () => {
    stubFetch();
    await openRolesTab();

    expect(await screen.findAllByText('Built-in')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    // …and their capability checkboxes can't be edited.
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled();
  });

  it('creates a new role with the capabilities ticked for it', async () => {
    const fetchMock = vi.fn();
    stubFetch((url, options) => {
      fetchMock(url, options);
      if (options?.method === 'POST') {
        return jsonResponse(201, {
          id: 3,
          name: 'Support Lead',
          slug: 'support-lead',
          permissions: ['manage_integrations'],
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          is_system: false,
          users_count: 0,
          created_at: '2026-09-07T00:00:00Z',
        });
      }
      return undefined;
    });
    const user = await openRolesTab();

    await user.click(screen.getByRole('button', { name: 'New role' }));
    // Scoped to the create form — the role cards below render the same
    // capability labels for their own checkboxes.
    const form = screen.getByLabelText('Role name').closest('form') as HTMLFormElement;
    await user.type(within(form).getByLabelText('Role name'), 'Support Lead');
    await user.click(within(form).getByLabelText('Manage integrations & webhooks'));
    await user.click(within(form).getByRole('button', { name: 'Create role' }));

    expect((await screen.findAllByText('Support Lead'))[0]).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/roles/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Support Lead', permissions: ['manage_integrations'] }),
        })
      )
    );
  });

  it('a custom role can be deleted, and offers a real confirm first', async () => {
    const customRole = {
      id: 3,
      name: 'Support Lead',
      slug: 'support-lead',
      permissions: [],
      function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
      is_system: false,
      users_count: 0,
      created_at: '2026-09-07T00:00:00Z',
    };
    stubFetch((url, options) => {
      if (options?.method === 'DELETE') return jsonResponse(204, null);
      if (url.includes('/auth/roles/')) return jsonResponse(200, [adminRole, csmRole, customRole]);
      return undefined;
    });
    const user = await openRolesTab();

    await user.click(await screen.findByRole('button', { name: 'Delete Support Lead' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Support Lead')).not.toBeInTheDocument());
  });

  it('New role: focus starts on the name; Cancel and a created role return it to the New role button', async () => {
    stubFetch((_url, options) =>
      options?.method === 'POST'
        ? jsonResponse(201, { id: 3, name: 'Support Lead', slug: 'support-lead', permissions: [], is_system: false, users_count: 0, created_at: '' })
        : undefined
    );
    const user = await openRolesTab();
    await user.click(screen.getByRole('button', { name: 'New role' }));
    expect(screen.getByLabelText('Role name')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New role' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'New role' }));
    await user.type(screen.getByLabelText('Role name'), 'Support Lead');
    await user.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New role' })).toHaveFocus());
  });

  it('Create role does nothing while the name is empty', async () => {
    const fetchMock = vi.fn();
    stubFetch((url, options) => {
      fetchMock(url, options);
      return undefined;
    });
    const user = await openRolesTab();
    await user.click(screen.getByRole('button', { name: 'New role' }));
    const create = screen.getByRole('button', { name: 'Create role' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    await user.click(create);
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it('Delete role: Cancel returns focus to the trash button; a confirmed delete lands on the list', async () => {
    const customRole = { id: 3, name: 'Support Lead', slug: 'support-lead', permissions: [], is_system: false, users_count: 0, created_at: '' };
    stubFetch((url, options) => {
      if (options?.method === 'DELETE') return jsonResponse(204, null);
      if (url.includes('/auth/roles/')) return jsonResponse(200, [adminRole, csmRole, customRole]);
      return undefined;
    });
    const user = await openRolesTab();
    const trash = await screen.findByRole('button', { name: 'Delete Support Lead' });
    await user.click(trash);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(trash).toHaveFocus();
    await user.click(trash);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Support Lead')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('list', { name: 'Roles' })).toHaveFocus());
  });
});

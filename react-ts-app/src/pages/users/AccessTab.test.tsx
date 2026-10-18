import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import accessReducer from '../../features/access/accessSlice';
import authReducer, { type User } from '../../features/auth/authSlice';
import { AccessTab } from './AccessTab';

// Integration tier: real store, fetch mocked at the boundary with the
// shapes revenact-backend's /identity/ endpoints actually return.

const roles = [
  { id: 1, name: 'Admin', slug: 'admin', permissions: ['manage_users'], is_system: true, users_count: 1, created_at: '' },
  { id: 2, name: 'CSM', slug: 'csm', permissions: [], is_system: true, users_count: 3, created_at: '' },
] as never;

const pendingRequest = {
  id: 7,
  email: 'new@acme.io',
  user_name: 'New Person',
  status: 'pending',
  requested_at: '2026-09-20T10:00:00Z',
  reviewed_at: null,
  rejection_reason: '',
};

const invitation = {
  id: 3,
  email: 'invited@acme.io',
  role_id: 2,
  role_name: 'CSM',
  department_id: null,
  department_name: '',
  status: 'pending',
  invited_by_name: 'Alice Admin',
  invited_at: '2026-09-20T10:00:00Z',
  expires_at: '2026-09-27T10:00:00Z',
  accepted_at: null,
};

const pendingDomain = {
  id: 5,
  domain: 'acme.io',
  is_primary: true,
  verification_status: 'pending',
  verified_at: null,
  dns_record: { type: 'TXT', name: 'acme.io', value: 'revenact-site-verification=tok-123' },
  created_at: '',
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(handler?: (url: string, options?: RequestInit) => ReturnType<typeof jsonResponse> | undefined) {
  const impl = vi.fn((url: string, options?: RequestInit) => {
    const custom = handler?.(url, options);
    if (custom) return Promise.resolve(custom);
    if (url.includes('/identity/access-requests/')) return Promise.resolve(jsonResponse(200, [pendingRequest]));
    if (url.includes('/identity/invitations/')) return Promise.resolve(jsonResponse(200, [invitation]));
    if (url.includes('/identity/domains/')) return Promise.resolve(jsonResponse(200, [pendingDomain]));
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

function renderTab(permissions: string[] = ['manage_users', 'manage_org_settings']) {
  const user = {
    id: 1,
    email: 'alice@acme.io',
    name: 'Alice Admin',
    avatar: '',
    role: 'admin',
    role_id: 1,
    role_name: 'Admin',
    permissions,
    function: 'cs',
    function_display: 'Customer Success',
    reports_to: null,
    organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc' },
    is_active: true,
  } as unknown as User;
  const store = configureStore({
    reducer: { access: accessReducer, auth: authReducer },
    preloadedState: {
      auth: { user, accessToken: 'a', refreshToken: 'r', isAuthenticated: true, isLoading: false, error: null },
    },
  });
  render(
    <Provider store={store}>
      <AccessTab roles={roles} />
    </Provider>
  );
  return store;
}

describe('Access tab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists who is waiting and approves them with a chosen role', async () => {
    const fetchMock = stubFetch((url, options) => {
      if (url.includes('/access-requests/7/approve/')) {
        expect(JSON.parse(String(options?.body))).toEqual({ role_id: 1 });
        return jsonResponse(200, { status: 'approved' });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByText('New Person')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Role for New Person'), '1');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.queryByText('New Person')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/identity/access-requests/7/approve/'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('surfaces the backend’s reason when an approval is refused', async () => {
    stubFetch((url) => {
      if (url.includes('/approve/')) {
        return jsonResponse(403, {
          success: false,
          error: { code: 'INSUFFICIENT_PERMISSION', message: 'You cannot grant a capability you do not hold yourself.' },
        });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/cannot grant a capability/)).toBeInTheDocument();
    expect(screen.getByText('New Person')).toBeInTheDocument();
  });

  it('sends an invitation and shows it in the list', async () => {
    stubFetch((url, options) => {
      if (url.includes('/identity/invitations/') && options?.method === 'POST') {
        expect(JSON.parse(String(options.body))).toEqual({ email: 'raj@acme.io', role_id: 2 });
        return jsonResponse(201, { ...invitation, id: 9, email: 'raj@acme.io' });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderTab();

    await user.type(await screen.findByLabelText('Work email'), 'raj@acme.io');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await screen.findByText('Invitation sent to raj@acme.io.')).toBeInTheDocument();
    expect(screen.getByText('raj@acme.io')).toBeInTheDocument();
  });

  it('cancels an invitation', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes('/invitations/3/cancel/')) return jsonResponse(200, { status: 'cancelled' });
      return undefined;
    });
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByText('invited@acme.io')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel the invitation to invited@acme.io' }));

    await waitFor(() => expect(screen.queryByText('invited@acme.io')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/identity/invitations/3/cancel/'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows the exact TXT record to publish and checks it on request', async () => {
    stubFetch((url) => {
      if (url.includes('/domains/5/verify/')) {
        return jsonResponse(200, { ...pendingDomain, verification_status: 'verified', verified_at: '2026-09-21T00:00:00Z', dns_record: null });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByText('revenact-site-verification=tok-123')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check DNS' }));

    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(screen.queryByText('revenact-site-verification=tok-123')).not.toBeInTheDocument();
  });

  it('tells the truth when the record is not published yet', async () => {
    stubFetch((url) => {
      if (url.includes('/verify/')) {
        return jsonResponse(400, {
          success: false,
          error: { code: 'DOMAIN_NOT_VERIFIED', message: 'That TXT record is not published yet. DNS can take a while to propagate.' },
        });
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Check DNS' }));

    expect(await screen.findByText(/not published yet/)).toBeInTheDocument();
  });

  it('hides domains from someone without manage_org_settings', async () => {
    const fetchMock = stubFetch();
    renderTab(['manage_users']);

    expect(await screen.findByText('New Person')).toBeInTheDocument();
    expect(screen.queryByText('Email domains')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/identity/domains/'), expect.anything());
  });
});

describe('Access on the settings frame (UI foundations spec §6.3, §7)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts each part in its own section and the invitation news in a status region that stays', async () => {
    stubFetch(() => undefined);
    renderTab();
    const waiting = await screen.findByRole('region', { name: 'Waiting to join' });
    expect(within(waiting).getByRole('list', { name: 'Waiting to join' })).toHaveClass('divide-y');
    const invitations = screen.getByRole('region', { name: 'Invitations' });
    const region = within(invitations).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(within(invitations).getByRole('button', { name: 'Send invitation' })).toHaveClass('bg-accent');
  });

  it('keeps the same status node when an invitation is sent', async () => {
    stubFetch((url, options) =>
      options?.method === 'POST' && url.includes('/identity/invitations/') ? jsonResponse(201, { ...invitation, id: 9, email: 'x@acme.io' }) : undefined
    );
    const user = userEvent.setup();
    renderTab();
    const invitations = await screen.findByRole('region', { name: 'Invitations' });
    const region = within(invitations).getByRole('status');
    await user.type(within(invitations).getByLabelText('Work email'), 'x@acme.io');
    await user.click(within(invitations).getByRole('button', { name: 'Send invitation' }));
    await waitFor(() => expect(region).toHaveTextContent('Invitation sent to x@acme.io.'));
    expect(within(invitations).getByRole('status')).toBe(region);
  });

  it('shows the TXT record as code on a quiet ground, not a box', async () => {
    stubFetch(() => undefined);
    renderTab();
    const domains = await screen.findByRole('region', { name: 'Domains' });
    const code = within(domains).getAllByText((_, element) => element?.tagName === 'CODE')[0];
    expect(code).toHaveClass('font-mono-brand');
    expect(code.className).not.toMatch(/\bborder\b/);
  });

  it('Check DNS keeps focus through a failed check (aria-disabled, not disabled)', async () => {
    let release: () => void = () => {};
    stubFetch((url, options) =>
      options?.method === 'POST' && url.includes('/verify')
        ? (new Promise((resolve) => {
            release = () => resolve(jsonResponse(400, { detail: 'No record found yet.' }));
          }) as never)
        : undefined
    );
    const user = userEvent.setup();
    renderTab();
    const domains = await screen.findByRole('region', { name: 'Domains' });
    const check = within(domains).getByRole('button', { name: 'Check DNS' });
    await user.click(check);
    expect(check).toHaveAttribute('aria-disabled', 'true');
    expect(check).not.toBeDisabled();
    expect(check).toHaveFocus();
    release();
    await waitFor(() => expect(check).not.toHaveAttribute('aria-disabled'));
    expect(check).toHaveFocus();
  });

  it('puts a refusal that is not about the email in the section, not on the email field', async () => {
    stubFetch((url, options) =>
      options?.method === 'POST' && url.includes('/identity/invitations/') ? jsonResponse(400, { detail: 'Your plan has no free seats.' }) : undefined
    );
    const user = userEvent.setup();
    renderTab();
    const invitations = await screen.findByRole('region', { name: 'Invitations' });
    const email = within(invitations).getByLabelText('Work email');
    await user.type(email, 'x@acme.io');
    await user.click(within(invitations).getByRole('button', { name: 'Send invitation' }));
    expect(await within(invitations).findByRole('alert')).toHaveTextContent('Your plan has no free seats.');
    expect(email).not.toHaveAttribute('aria-invalid', 'true');
    expect(email).not.toHaveAttribute('aria-describedby');
  });

  it('keeps the field error for the email check', async () => {
    stubFetch(() => undefined);
    const user = userEvent.setup();
    renderTab();
    const invitations = await screen.findByRole('region', { name: 'Invitations' });
    await user.type(within(invitations).getByLabelText('Work email'), 'nope');
    await user.click(within(invitations).getByRole('button', { name: 'Send invitation' }));
    expect(within(invitations).getByLabelText('Work email')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Access: focus after a decision or a cancel (spec §6.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  const second = { ...pendingRequest, id: 8, email: 'other@acme.io', user_name: 'Other Person' };
  const secondInvitation = { ...invitation, id: 4, email: 'second@acme.io' };

  function stubTwo(extra?: (url: string, options?: RequestInit) => ReturnType<typeof jsonResponse> | undefined) {
    return stubFetch((url, options) => {
      const custom = extra?.(url, options);
      if (custom) return custom;
      if (url.includes('/approve/') || url.includes('/reject/')) return jsonResponse(200, { status: url.includes('/approve/') ? 'approved' : 'rejected' });
      if (url.includes('/cancel/')) return jsonResponse(200, { status: 'cancelled' });
      if (url.includes('/identity/access-requests/')) return jsonResponse(200, [pendingRequest, second]);
      if (url.includes('/identity/invitations/')) return jsonResponse(200, [invitation, secondInvitation]);
      return undefined;
    });
  }

  it('moves focus to the Waiting to join list after Approve', async () => {
    stubTwo();
    const user = userEvent.setup();
    renderTab();
    const waiting = await screen.findByRole('region', { name: 'Waiting to join' });
    await within(waiting).findByText('Other Person');
    await user.click(within(waiting).getAllByRole('button', { name: 'Approve' })[0]);
    await waitFor(() => expect(within(waiting).getByRole('list', { name: 'Waiting to join' })).toHaveFocus());
    expect(within(waiting).queryByText('New Person')).toBeNull();
  });

  it('moves focus to the Waiting to join list after Reject', async () => {
    stubTwo();
    const user = userEvent.setup();
    renderTab();
    const waiting = await screen.findByRole('region', { name: 'Waiting to join' });
    await within(waiting).findByText('Other Person');
    await user.click(within(waiting).getAllByRole('button', { name: 'Reject' })[0]);
    await waitFor(() => expect(within(waiting).getByRole('list', { name: 'Waiting to join' })).toHaveFocus());
  });

  it('moves focus to Work email when the last request is decided', async () => {
    stubFetch((url) => (url.includes('/approve/') ? jsonResponse(200, { status: 'approved' }) : undefined));
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByLabelText('Work email')).toHaveFocus());
  });

  it('moves focus to the Pending invitations list after Cancel', async () => {
    stubTwo();
    const user = userEvent.setup();
    renderTab();
    const pending = await screen.findByRole('region', { name: 'Pending invitations' });
    await user.click(within(pending).getByRole('button', { name: 'Cancel the invitation to invited@acme.io' }));
    await waitFor(() => expect(within(pending).getByRole('list', { name: 'Pending invitations' })).toHaveFocus());
    expect(within(pending).queryByText('invited@acme.io')).toBeNull();
  });

  it('moves focus to Work email after the last Cancel', async () => {
    stubFetch((url) => (url.includes('/cancel/') ? jsonResponse(200, { status: 'cancelled' }) : undefined));
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole('button', { name: 'Cancel the invitation to invited@acme.io' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Pending invitations' })).toBeNull());
    expect(screen.getByLabelText('Work email')).toHaveFocus();
  });

  it('keeps focus on Approve while it works (aria-disabled), and a double press makes one call', async () => {
    let release: () => void = () => {};
    const fetchMock = stubTwo((url) =>
      url.includes('/approve/')
        ? (new Promise((resolve) => {
            release = () => resolve(jsonResponse(200, { status: 'approved' }));
          }) as never)
        : undefined
    );
    renderTab();
    const waiting = await screen.findByRole('region', { name: 'Waiting to join' });
    await within(waiting).findByText('Other Person');
    const approve = within(waiting).getAllByRole('button', { name: 'Approve' })[0];
    approve.focus();
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(approve).toHaveAttribute('aria-disabled', 'true');
    expect(approve).not.toBeDisabled();
    expect(approve).toHaveFocus();
    await act(async () => release());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/approve/'))).toHaveLength(1);
  });

  it('makes one call for a double press on Reject and on Cancel', async () => {
    const fetchMock = stubTwo();
    renderTab();
    const waiting = await screen.findByRole('region', { name: 'Waiting to join' });
    await within(waiting).findByText('Other Person');
    const reject = within(waiting).getAllByRole('button', { name: 'Reject' })[0];
    fireEvent.click(reject);
    fireEvent.click(reject);
    const cancel = within(screen.getByRole('region', { name: 'Pending invitations' })).getByRole('button', { name: 'Cancel the invitation to invited@acme.io' });
    fireEvent.click(cancel);
    fireEvent.click(cancel);
    await waitFor(() => expect(within(waiting).queryByText('New Person')).toBeNull());
    await waitFor(() => expect(screen.queryByText('invited@acme.io')).toBeNull());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/reject/'))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/cancel/'))).toHaveLength(1);
  });
});

describe('Access: copying the TXT record value', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the button so "Copied" is heard, then resets it', async () => {
    stubFetch(() => undefined);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderTab();
    const domains = await screen.findByRole('region', { name: 'Domains' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(within(domains).getByRole('button', { name: 'Copy record value' }));
      expect(await within(domains).findByRole('button', { name: 'Copied record value' })).toBeInTheDocument();
      expect(writeText).toHaveBeenCalledWith('revenact-site-verification=tok-123');
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(within(domains).getByRole('button', { name: 'Copy record value' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

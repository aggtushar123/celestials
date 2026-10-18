import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import platformReducer from '../../features/platform/platformSlice';
import { RequirePlatform } from '../../components/auth/RequirePlatform';
import { PlatformLayout } from '../../layouts/PlatformLayout';
import { PlatformOverview } from './PlatformOverview';
import { PlatformOrganisations } from './PlatformOrganisations';
import { PlatformOrganisationDetail } from './PlatformOrganisationDetail';
import { PlatformAccount } from './PlatformAccount';

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,stub' } }));

// Integration tier: the real guard, layout and pages over a store whose
// auth state says who this is and whether the session passed a second
// factor; fetch mocked with the shapes /api/v1/platform/ actually returns.

const staff = {
  id: 9,
  email: 'staff@revenact.io',
  name: 'Staff',
  avatar: '',
  role: '',
  role_id: null,
  role_name: '',
  permissions: [],
  function: 'other',
  function_display: 'Other',
  reports_to: null,
  organisation: null,
  is_active: true,
  is_superuser: true,
  mfa_enrolled: true,
} as unknown as User;

const acme = {
  id: 1,
  name: 'Acme Inc',
  slug: 'acme-inc',
  status: 'active',
  created_at: '2026-09-01T00:00:00Z',
  owner: { id: 2, name: 'Owner', email: 'owner@acme.io' },
  members_active: 2,
  pending_requests: 1,
  domains: [{ domain: 'acme.io', verification_status: 'verified' }],
  plan: null,
  gmail: { enabled: false, connected: 0, paused: 0 },
};

const acmeDetail = {
  ...acme,
  open_invitations: 0,
  memberships: [
    { id: 1, user_id: 2, name: 'Owner', email: 'owner@acme.io', role: 'Admin', department: null, status: 'active', is_owner: true, is_active: true, approved_at: null, last_login: null },
    { id: 2, user_id: 3, name: 'Carl', email: 'carl@acme.io', role: 'CSM', department: 'Success', status: 'active', is_owner: false, is_active: true, approved_at: null, last_login: null },
  ],
  domains: [{ id: 5, domain: 'acme.io', is_primary: true, verification_status: 'verified', verified_at: null }],
  recent_events: [{ action: 'auth.login', actor: 'owner@acme.io', outcome: 'success', target: '', at: '2026-09-20T10:00:00Z' }],
};

const acmeBilling = {
  plan: { code: 'trial', name: 'Trial', seats_included: 3, monthly_credits: 200, price_cents: 0, currency: 'USD', is_trial: true },
  status: 'trialing',
  seats: { used: 2, limit: 3 },
  credits: { balance: 200 },
  trial_ends_at: '2026-10-05T00:00:00Z',
  current_period_end: null,
  enforced: true,
  stripe_customer_id: '',
  stripe_subscription_id: '',
  ledger: [{ id: 1, kind: 'grant', amount: 200, balance_after: 200, reason: 'Trial', actor: null, at: '2026-09-21T00:00:00Z' }],
  plans: [{ code: 'trial', name: 'Trial', seats_included: 3, monthly_credits: 200 }, { code: 'team', name: 'Team', seats_included: 10, monthly_credits: 2000 }],
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderPortal(path: string, options: { user?: User; mfaVerified?: boolean; handler?: (url: string, init?: RequestInit) => ReturnType<typeof jsonResponse> | undefined } = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const custom = options.handler?.(url, init);
    if (custom) return Promise.resolve(custom);
    if (url.includes('/platform/overview/')) {
      return Promise.resolve(jsonResponse(200, { organisations: { total: 1, pending: 0, active: 1, suspended: 0, archived: 0 }, members_active: 2, pending_requests: 1, open_invitations: 0, verified_domains: 1, staff: 1, gmail: { enabled_workspaces: 2, connected: 37, test_user_cap: 100 } }));
    }
    if (/\/platform\/organisations\/\d+\/billing\/$/.test(url)) return Promise.resolve(jsonResponse(200, acmeBilling));
    if (/\/platform\/organisations\/1\/$/.test(url)) return Promise.resolve(jsonResponse(200, acmeDetail));
    if (url.includes('/platform/organisations/')) return Promise.resolve(jsonResponse(200, [acme]));
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  const store = configureStore({
    reducer: { auth: authReducer, platform: platformReducer },
    preloadedState: {
      auth: {
        user: options.user ?? staff,
        accessToken: 'a',
        refreshToken: 'r',
        isAuthenticated: true,
        isLoading: false,
        error: null,
        mfaChallenge: null,
        mfaVerified: options.mfaVerified ?? true,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/platform" element={<RequirePlatform><PlatformLayout /></RequirePlatform>}>
            <Route index element={<PlatformOverview />} />
            <Route path="organisations" element={<PlatformOrganisations />} />
            <Route path="organisations/:id" element={<PlatformOrganisationDetail />} />
          </Route>
          <Route path="/platform/account" element={<RequirePlatform requireMfa={false}><PlatformLayout /></RequirePlatform>}>
            <Route index element={<PlatformAccount />} />
          </Route>
          <Route path="/work" element={<div>Tenant Work</div>} />
          <Route path="/login" element={<div>Sign-in Page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return { store, fetchMock };
}

describe('Platform portal', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows connected Google mailboxes against the test-user cap', async () => {
    renderPortal('/platform');
    expect(await screen.findByText('Google mailboxes')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
    expect(screen.getByText('of 100 test users · 2 workspaces on')).toBeInTheDocument();
  });

  it('lists whether each workspace has Gmail on', async () => {
    renderPortal('/platform/organisations');
    await screen.findByText('Acme Inc');
    expect(screen.getByRole('columnheader', { name: 'Gmail' })).toBeInTheDocument();
    const row = screen.getByRole('link', { name: 'Acme Inc' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('Off')).toBeInTheDocument();
  });

  it('turns Google two-way mail on with a reason, and shows both counts', async () => {
    const posts: unknown[] = [];
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/gmail/') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          posts.push(body);
          return jsonResponse(200, { gmail: { enabled: body.enabled, connected: 0, paused: 0 } });
        }
        return undefined;
      },
    });
    const card = await screen.findByRole('region', { name: 'Google two-way mail' });
    const turnOn = within(card).getByRole('button', { name: 'Turn on' });
    expect(turnOn).toBeDisabled();
    await userEvent.type(within(card).getByLabelText('Reason for turning it on'), 'Pilot approved: 6 users added in Google Cloud');
    await userEvent.click(turnOn);
    expect(await within(card).findByRole('button', { name: 'Turn off' })).toBeInTheDocument();
    expect(posts).toEqual([{ enabled: true, reason: 'Pilot approved: 6 users added in Google Cloud' }]);
    expect(within(card).getByText('Connected here').nextElementSibling).toHaveTextContent('0');
    await waitFor(() => expect(within(card).getByText('Google test users, all workspaces').nextElementSibling).toHaveTextContent('37 of 100'));
    expect(within(card).getByLabelText('Reason for turning it off')).toHaveValue('');
  });

  it('verifies a domain that cannot carry DNS, with a reason', async () => {
    const pending = { id: 6, domain: 'acme.onworkspace.com', is_primary: false, verification_status: 'pending', verified_at: null };
    const posts: { url: string; body: unknown }[] = [];
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/domains/6/verify/') && init?.method === 'POST') {
          posts.push({ url, body: JSON.parse(String(init.body)) });
          return jsonResponse(200, { ...pending, verification_status: 'verified', verified_at: '2026-10-17T10:00:00Z' });
        }
        if (/\/platform\/organisations\/1\/$/.test(url)) return jsonResponse(200, { ...acmeDetail, domains: [...acmeDetail.domains, pending] });
        return undefined;
      },
    });
    const domains = await screen.findByRole('region', { name: 'Domains' });
    // A verified domain offers nothing to do.
    expect(within(domains).getAllByRole('button', { name: /Verify/ })).toHaveLength(1);
    const verify = within(domains).getByRole('button', { name: 'Verify acme.onworkspace.com' });
    expect(verify).toBeDisabled();
    await userEvent.type(within(domains).getByLabelText('Why acme.onworkspace.com is theirs'), 'Workspace admin confirmed on a call');
    await userEvent.click(verify);
    await waitFor(() => expect(within(domains).queryByRole('button', { name: /Verify/ })).not.toBeInTheDocument());
    expect(posts).toEqual([{ url: expect.stringContaining('/platform/organisations/1/domains/6/verify/'), body: { reason: 'Workspace admin confirmed on a call' } }]);
  });

  it('shows why a domain cannot be verified, in the backend’s words', async () => {
    const pending = { id: 6, domain: 'gmail.com', is_primary: false, verification_status: 'pending', verified_at: null };
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/verify/') && init?.method === 'POST') {
          return jsonResponse(400, { success: false, error: { code: 'PERSONAL_DOMAIN', message: 'A personal mail domain is never a company.' } });
        }
        if (/\/platform\/organisations\/1\/$/.test(url)) return jsonResponse(200, { ...acmeDetail, domains: [pending] });
        return undefined;
      },
    });
    const domains = await screen.findByRole('region', { name: 'Domains' });
    await userEvent.type(within(domains).getByLabelText('Why gmail.com is theirs'), 'x');
    await userEvent.click(within(domains).getByRole('button', { name: 'Verify gmail.com' }));
    expect(await within(domains).findByRole('alert')).toHaveTextContent('A personal mail domain is never a company.');
  });

  it('shows the portal refusal on the card', async () => {
    renderPortal('/platform/organisations/1', {
      handler: (url, init) =>
        url.includes('/gmail/') && init?.method === 'POST' ? jsonResponse(400, { success: false, error: { code: 'REASON_REQUIRED', message: 'A reason is required.' } }) : undefined,
    });
    const card = await screen.findByRole('region', { name: 'Google two-way mail' });
    await userEvent.type(within(card).getByLabelText('Reason for turning it on'), 'x');
    await userEvent.click(within(card).getByRole('button', { name: 'Turn on' }));
    expect(await within(card).findByRole('alert')).toHaveTextContent('A reason is required.');
  });

  it('sends a tenant user back to the app', async () => {
    const tenant = { ...staff, is_superuser: false } as User;
    renderPortal('/platform', { user: tenant });
    expect(await screen.findByText('Tenant Work')).toBeInTheDocument();
  });

  it('lets unverified staff reach their account page to set up the second factor', async () => {
    const unenrolled = { ...staff, mfa_enrolled: false } as User;
    renderPortal('/platform/account', {
      user: unenrolled,
      mfaVerified: false,
      handler: (url) => (url.includes('/auth/me/') ? jsonResponse(200, unenrolled) : undefined),
    });
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set up an authenticator app' })).toBeInTheDocument();
    expect(screen.queryByText('Two-factor authentication needed')).not.toBeInTheDocument();
  });

  it('signs out from the portal header', async () => {
    const { store } = renderPortal('/platform', {
      handler: (url, init) => (url.includes('/auth/logout/') && init?.method === 'POST' ? jsonResponse(200, {}) : undefined),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(false));
    // The portal is gone; in the real app ProtectedRoute then lands on /login.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument());
    expect(localStorage.getItem('revenact_access_token')).toBeNull();
  });

  it('tells staff whose session skipped the second factor what to do', async () => {
    const { fetchMock } = renderPortal('/platform', { mfaVerified: false });
    expect(await screen.findByText('Two-factor authentication needed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs the session out before sending staff to sign in again', async () => {
    for (const name of ['Sign in again', 'Sign in as someone else']) {
      localStorage.setItem('revenact_access_token', 'a');
      const { store } = renderPortal('/platform', {
        mfaVerified: false,
        handler: (url, init) => (url.includes('/auth/logout/') && init?.method === 'POST' ? jsonResponse(200, {}) : undefined),
      });
      await userEvent.setup().click(await screen.findByRole('button', { name }));
      // Signed in, /login would send them straight back here: a loop.
      expect(await screen.findByText('Sign-in Page')).toBeInTheDocument();
      await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(false));
      expect(localStorage.getItem('revenact_access_token')).toBeNull();
      cleanup();
    }
  });

  it('points an unenrolled staff member at Account settings', async () => {
    const unenrolled = { ...staff, mfa_enrolled: false } as User;
    renderPortal('/platform', { user: unenrolled, mfaVerified: false });
    expect(await screen.findByRole('link', { name: 'Set up two-factor' })).toBeInTheDocument();
  });

  it('shows the overview numbers', async () => {
    renderPortal('/platform');
    expect(await screen.findByText('Organisations')).toBeInTheDocument();
    expect(await screen.findByText('1 active · 0 suspended')).toBeInTheDocument();
  });

  it('lists organisations with owner, domain and counts', async () => {
    renderPortal('/platform/organisations');
    expect(await screen.findByText('Acme Inc')).toBeInTheDocument();
    expect(screen.getByText('owner@acme.io')).toBeInTheDocument();
    expect(screen.getByText('acme.io')).toBeInTheDocument();
  });

  it('suspends an organisation with a reason, and reactivates it', async () => {
    const posts: string[] = [];
    const { fetchMock } = renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/status/') && init?.method === 'POST') {
          posts.push(String(init.body));
          const body = JSON.parse(String(init.body));
          return jsonResponse(200, { status: body.status });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Acme Inc' })).toBeInTheDocument();
    const suspend = screen.getByRole('button', { name: 'Suspend organisation' });
    expect(suspend).toBeDisabled();
    await user.type(screen.getByLabelText('Reason'), 'Non-payment');
    await user.click(suspend);

    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    expect(posts[0]).toBe(JSON.stringify({ status: 'suspended', reason: 'Non-payment' }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/platform/organisations/1/status/'), expect.anything());
  });

  it('hands ownership to another active member', async () => {
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/owner/') && init?.method === 'POST') {
          expect(JSON.parse(String(init.body))).toEqual({ user_id: 3 });
          return jsonResponse(200, { owner: { id: 3, name: 'Carl', email: 'carl@acme.io' } });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Hand over to'), '3');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));

    // The owner card now names Carl.
    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'Owner' })).getByText('carl@acme.io')).toBeInTheDocument()
    );
  });

  it('creates an organisation whose owner is its root user', { timeout: 15000 }, async () => {
    const { fetchMock } = renderPortal('/platform/organisations', {
      handler: (url, init) => {
        if (url.endsWith('/platform/organisations/') && init?.method === 'POST') {
          expect(JSON.parse(String(init.body))).toEqual({ name: 'Newco', owner_email: 'priya@newco.io', owner_name: 'Priya' });
          return jsonResponse(201, { ...acme, id: 7, name: 'Newco', slug: 'newco', owner: { id: 20, name: 'Priya', email: 'priya@newco.io' }, members_active: 1, pending_requests: 0, domains: [], owner_mailed: false });
        }
        if (/\/platform\/organisations\/7\/$/.test(url)) {
          return jsonResponse(200, { ...acmeDetail, id: 7, name: 'Newco', slug: 'newco', owner: { id: 20, name: 'Priya', email: 'priya@newco.io' }, memberships: [{ ...acmeDetail.memberships[0], user_id: 20, name: 'Priya', email: 'priya@newco.io' }] });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New organisation' }));
    await user.type(screen.getByLabelText('Organisation name'), 'Newco');
    await user.type(screen.getByLabelText('Owner’s work email'), 'priya@newco.io');
    await user.type(screen.getByLabelText('Owner’s name (optional)'), 'Priya');
    await user.click(screen.getByRole('button', { name: 'Create organisation' }));

    expect(await screen.findByRole('heading', { name: 'Newco' })).toBeInTheDocument();
    expect(screen.getByText(/priya@newco.io is the root user/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/platform/organisations/'), expect.objectContaining({ method: 'POST' }));
  });

  it('refuses an owner address that already has an account, in the backend’s words', { timeout: 15000 }, async () => {
    renderPortal('/platform/organisations', {
      handler: (url, init) => {
        if (url.endsWith('/platform/organisations/') && init?.method === 'POST') {
          return jsonResponse(400, { success: false, error: { code: 'EMAIL_TAKEN', message: 'That address already belongs to an account.' } });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New organisation' }));
    await user.type(screen.getByLabelText('Organisation name'), 'Again');
    await user.type(screen.getByLabelText('Owner’s work email'), 'carl@acme.io');
    await user.click(screen.getByRole('button', { name: 'Create organisation' }));
    expect(await screen.findByText('That address already belongs to an account.')).toBeInTheDocument();
  });

  it('renames an organisation in place', async () => {
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (/\/platform\/organisations\/1\/$/.test(url) && init?.method === 'PATCH') {
          expect(JSON.parse(String(init.body))).toEqual({ name: 'Acme Corporation' });
          return jsonResponse(200, { id: 1, name: 'Acme Corporation', slug: 'acme-inc' });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Rename organisation' }));
    const input = screen.getByLabelText('Organisation name');
    await user.clear(input);
    await user.type(input, 'Acme Corporation');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('heading', { name: 'Acme Corporation' })).toBeInTheDocument();
  });

  it('archives an organisation with a reason, after a confirmation step', async () => {
    const calls: string[] = [];
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (/\/platform\/organisations\/1\/$/.test(url) && init?.method === 'DELETE') {
          calls.push(String(init.body));
          return jsonResponse(200, { status: 'archived' });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Archive this organisation' }));
    const archive = screen.getByRole('button', { name: 'Archive organisation' });
    expect(archive).toBeDisabled();
    await user.type(screen.getByLabelText('Reason for archiving'), 'Churned');
    await user.click(archive);
    expect(await screen.findByRole('heading', { name: 'Archived' })).toBeInTheDocument();
    expect(calls[0]).toBe(JSON.stringify({ reason: 'Churned' }));
  });

  it('shows billing and lets staff adjust credits with a reason', async () => {
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/billing/credits/') && init?.method === 'POST') {
          expect(JSON.parse(String(init.body))).toEqual({ amount: 100, reason: 'Onboarding gift' });
          return jsonResponse(200, { ...acmeBilling, credits: { balance: 300 }, ledger: undefined, plans: undefined });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Billing' })).toBeInTheDocument();
    expect(screen.getAllByText('200').length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText('Adjust credits (signed)'), '100');
    await user.type(screen.getByLabelText('Credit reason'), 'Onboarding gift');
    await user.click(screen.getByRole('button', { name: 'Apply credits' }));

    expect(await screen.findByText('300')).toBeInTheDocument();
  });

  it('changes the plan from the portal', async () => {
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/billing/plan/') && init?.method === 'POST') {
          expect(JSON.parse(String(init.body))).toEqual({ plan_code: 'team', reason: 'Signed' });
          return jsonResponse(200, { ...acmeBilling, plan: { ...acmeBilling.plan, code: 'team', name: 'Team', is_trial: false }, status: 'active', seats: { used: 2, limit: 10 }, trial_ends_at: null, ledger: undefined, plans: undefined });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Billing' });
    await user.selectOptions(screen.getByLabelText('Plan'), 'team');
    await user.type(screen.getByLabelText('Plan reason'), 'Signed');
    await user.click(screen.getByRole('button', { name: 'Change plan' }));
    expect(await screen.findByText(/of 10/)).toBeInTheDocument();
  });

  it('shows a refused action in the backend’s words', async () => {
    renderPortal('/platform/organisations/1', {
      handler: (url, init) => {
        if (url.includes('/owner/') && init?.method === 'POST') {
          return jsonResponse(400, { success: false, error: { code: 'NOT_A_MEMBER', message: 'The new owner must be an active member.' } });
        }
        return undefined;
      },
    });
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Hand over to'), '3');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    expect(await screen.findByText('The new owner must be an active member.')).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { AuthCallback } from './AuthCallback';

const mockUser = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice Admin',
  avatar: '',
  role: 'admin' as const,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc' },
  is_active: true,
};

function renderCallback(search: string) {
  const store = configureStore({ reducer: { auth: authReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<div>Dashboard Home</div>} />
          <Route path="/login" element={<div>Sign-in Page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return store;
}

describe('OAuth callback', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('trades the hand-off code for a session and continues into the app', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' }),
      })
    );

    const store = renderCallback('?handoff=one-time-code');

    await waitFor(() => expect(screen.getByText('Dashboard Home')).toBeInTheDocument());
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('revenact_access_token')).toBe('access.jwt');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/oauth/exchange/'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('spends the hand-off code once even though effects run twice in strict mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCallback('?handoff=one-time-code');

    await waitFor(() => expect(screen.getByText('Dashboard Home')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives a pending request its own screen rather than a red error', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderCallback('?error=ACCESS_REQUEST_PENDING');

    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(screen.getByText(/waiting for an administrator to approve/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('explains an unverified domain in words, not a code', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderCallback('?error=DOMAIN_NOT_VERIFIED');

    expect(await screen.findByText('Could not sign you in')).toBeInTheDocument();
    expect(screen.getByText(/has verified that email domain yet/)).toBeInTheDocument();
    expect(screen.queryByText('DOMAIN_NOT_VERIFIED')).not.toBeInTheDocument();
  });

  it('falls back to a usable message for a code it has never seen', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderCallback('?error=SOMETHING_NEW');

    expect(await screen.findByText(/Please try again, or contact your administrator/)).toBeInTheDocument();
  });

  it('reports a spent code instead of stranding the person on a spinner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { code: 'INVALID_HANDOFF', message: 'expired' },
        }),
      })
    );

    renderCallback('?handoff=already-used');

    expect(await screen.findByText(/already been used or has expired/)).toBeInTheDocument();
    expect(localStorage.getItem('revenact_access_token')).toBeNull();
  });

  it('shows the workspace form for a setup code and creates the workspace', async () => {
    const fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('/workspace/preview/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            email: 'priya@newco.io',
            name: 'Priya Founder',
            domain: 'newco.io',
            suggested_organisation_name: 'Newco',
          }),
        };
      }
      if (String(url).includes('/auth/oauth/workspace/')) {
        expect(JSON.parse(init?.body ?? '{}')).toEqual({
          setup: 'setup-code',
          organisation_name: 'Newco Labs',
          name: 'Priya Founder',
        });
        return {
          ok: true,
          status: 201,
          json: async () => ({
            user: { ...mockUser, email: 'priya@newco.io', organisation: { id: 2, name: 'Newco Labs', slug: 'newco-labs' } },
            access: 'access.jwt',
            refresh: 'refresh.jwt',
          }),
        };
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    const store = renderCallback('?setup=setup-code');

    expect(await screen.findByText('Set up your workspace')).toBeInTheDocument();
    expect(screen.getByText('newco.io')).toBeInTheDocument();
    // Scrubbed from the address bar before anything else happens.
    expect(window.location.search).not.toContain('setup-code');

    const companyName = screen.getByLabelText('Company name') as HTMLInputElement;
    expect(companyName.value).toBe('Newco');
    await user.clear(companyName);
    await user.type(companyName, 'Newco Labs');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(screen.getByText('Dashboard Home')).toBeInTheDocument());
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user?.organisation.name).toBe('Newco Labs');
  });

  it('explains a workspace claimed in the meantime instead of failing silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/workspace/preview/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ email: 'raj@newco.io', name: 'Raj', domain: 'newco.io', suggested_organisation_name: 'Newco' }),
          };
        }
        return {
          ok: false,
          status: 409,
          json: async () => ({ success: false, error: { code: 'WORKSPACE_CLAIMED', message: 'claimed' } }),
        };
      })
    );
    const user = userEvent.setup();

    renderCallback('?setup=setup-code');

    await user.click(await screen.findByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByText('Could not sign you in')).toBeInTheDocument();
    expect(screen.getByText(/already started a workspace/)).toBeInTheDocument();
  });

  it('treats an expired setup code like any other spent link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { code: 'INVALID_SETUP', message: 'expired' } }),
      })
    );

    renderCallback('?setup=stale');

    expect(await screen.findByText(/set-up session has expired/)).toBeInTheDocument();
  });

  it('sends someone who lands here with nothing back to sign in', async () => {
    vi.stubGlobal('fetch', vi.fn());

    renderCallback('');

    expect(await screen.findByText('Nothing to complete here')).toBeInTheDocument();
  });
});

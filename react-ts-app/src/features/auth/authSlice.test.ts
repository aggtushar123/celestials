import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, {
  login,
  logout,
  clearError,
  fetchMe,
  updateProfile,
  updateOrganisation,
  changePassword,
  requestPasswordReset,
  confirmPasswordReset,
  refreshSession,
  loggedOut,
} from './authSlice';
import { loadMembers, resetMembersCache } from '../knowledge/useMembers';

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

// Matches revenact-backend's UserSerializer/login response shape — see
// revenact-backend/docs/API_CONTRACTS.md.
const mockUser = {
  id: 1,
  email: 'demo@revenact.io',
  name: 'Demo User',
  avatar: 'https://i.pravatar.cc/150?u=demo@revenact.io',
  role: 'admin' as const,
  organisation: {
    id: 1,
    name: 'Acme Inc',
    slug: 'acme-inc',
    currency: 'USD' as const,
    currency_display: 'US Dollar ($)',
    default_lifecycle_stage: '',
    ai_agent_enabled: true,
    ai_agent_tone: 'professional' as const,
    ai_agent_tone_display: 'Professional',
  },
  is_active: true,
};

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

describe('authSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('starts unauthenticated with no user', () => {
    const state = makeStore().getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.error).toBeNull();
  });

  it('login with valid credentials authenticates and issues tokens', async () => {
    mockFetchOnce(200, { user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' });

    const store = makeStore();
    await store.dispatch(login({ email: 'demo@revenact.io', password: 'demo1234' }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe('demo@revenact.io');
    expect(state.user?.organisation.name).toBe('Acme Inc');
    expect(state.accessToken).toBe('access.jwt');
    expect(state.refreshToken).toBe('refresh.jwt');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('login with wrong password sets an error and stays unauthenticated', async () => {
    mockFetchOnce(401, { detail: 'No active account found with the given credentials' });

    const store = makeStore();
    await store.dispatch(login({ email: 'demo@revenact.io', password: 'wrong' }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('No active account found with the given credentials');
    expect(state.accessToken).toBeNull();
  });

  it('login when the server is unreachable sets a generic error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const store = makeStore();
    await store.dispatch(login({ email: 'demo@revenact.io', password: 'demo1234' }));

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Could not reach the server. Please try again.');
  });

  it('persists session to localStorage on login', async () => {
    mockFetchOnce(200, { user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' });

    const store = makeStore();
    await store.dispatch(login({ email: 'demo@revenact.io', password: 'demo1234' }));

    expect(localStorage.getItem('revenact_access_token')).toBe('access.jwt');
    expect(localStorage.getItem('revenact_refresh_token')).toBe('refresh.jwt');
    expect(JSON.parse(localStorage.getItem('revenact_user')!).email).toBe('demo@revenact.io');
  });

  describe('own profile', () => {
    async function loggedInStore() {
      mockFetchOnce(200, { user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' });
      const store = makeStore();
      await store.dispatch(login({ email: 'demo@revenact.io', password: 'demo1234' }));
      return store;
    }

    it('fetchMe replaces user with the fresh copy from the server', async () => {
      const store = await loggedInStore();
      const freshUser = { ...mockUser, name: 'Renamed Elsewhere' };
      mockFetchOnce(200, freshUser);

      await store.dispatch(fetchMe());

      expect(store.getState().auth.user?.name).toBe('Renamed Elsewhere');
      expect(JSON.parse(localStorage.getItem('revenact_user')!).name).toBe('Renamed Elsewhere');
    });

    it('updateProfile updates the name and persists it', async () => {
      const store = await loggedInStore();
      mockFetchOnce(200, { ...mockUser, name: 'New Name' });

      await store.dispatch(updateProfile({ name: 'New Name' }));

      expect(store.getState().auth.user?.name).toBe('New Name');
      expect(JSON.parse(localStorage.getItem('revenact_user')!).name).toBe('New Name');
    });

    it("updateOrganisation replaces user.organisation and persists it", async () => {
      const store = await loggedInStore();
      const updatedOrg = { ...mockUser.organisation, currency: 'EUR' as const, default_lifecycle_stage: 'adoption' };
      mockFetchOnce(200, updatedOrg);

      await store.dispatch(updateOrganisation({ currency: 'EUR', default_lifecycle_stage: 'adoption' }));

      expect(store.getState().auth.user?.organisation.currency).toBe('EUR');
      expect(store.getState().auth.user?.organisation.default_lifecycle_stage).toBe('adoption');
      expect(JSON.parse(localStorage.getItem('revenact_user')!).organisation.currency).toBe('EUR');
    });

    it('updateOrganisation rejects with the server message for a non-admin, without touching state', async () => {
      const store = await loggedInStore();
      mockFetchOnce(403, { detail: 'Only an organisation admin can do this.' });

      const result = await store.dispatch(updateOrganisation({ currency: 'EUR' }));

      expect(result.payload).toBe('Only an organisation admin can do this.');
      expect(store.getState().auth.user?.organisation.currency).toBe('USD');
    });

    it('changePassword resolves without touching user state on success', async () => {
      const store = await loggedInStore();
      mockFetchOnce(200, null);

      const result = await store.dispatch(
        changePassword({ currentPassword: 'old12345', newPassword: 'newpassword1' })
      );

      expect(changePassword.fulfilled.match(result)).toBe(true);
      expect(store.getState().auth.user?.name).toBe(mockUser.name);
    });

    it('changePassword surfaces the backend field error on a wrong current password', async () => {
      const store = await loggedInStore();
      mockFetchOnce(400, { current_password: ['Current password is incorrect.'] });

      const result = await store.dispatch(
        changePassword({ currentPassword: 'wrong', newPassword: 'newpassword1' })
      );

      expect(changePassword.rejected.match(result)).toBe(true);
      expect(result.payload).toBe('Current password is incorrect.');
    });
  });

  describe('forgot/reset password', () => {
    it('requestPasswordReset resolves on the backend\'s always-200 response', async () => {
      mockFetchOnce(200, { detail: "If an account exists for that email, we've sent a password reset link." });

      const store = makeStore();
      const result = await store.dispatch(requestPasswordReset('alice@acme.io'));

      expect(requestPasswordReset.fulfilled.match(result)).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/password-reset/'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'alice@acme.io' }) })
      );
    });

    it('requestPasswordReset surfaces a network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      const store = makeStore();
      const result = await store.dispatch(requestPasswordReset('alice@acme.io'));

      expect(requestPasswordReset.rejected.match(result)).toBe(true);
      expect(result.payload).toBe('Could not reach the server. Please try again.');
    });

    it('confirmPasswordReset resolves on a valid uid/token', async () => {
      mockFetchOnce(200, { detail: 'Your password has been reset.' });

      const store = makeStore();
      const result = await store.dispatch(
        confirmPasswordReset({ uid: 'MQ', token: 'a-valid-token', newPassword: 'newpassword1' })
      );

      expect(confirmPasswordReset.fulfilled.match(result)).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/password-reset/confirm/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ uid: 'MQ', token: 'a-valid-token', new_password: 'newpassword1' }),
        })
      );
    });

    it('confirmPasswordReset surfaces the backend error on an invalid/expired token', async () => {
      mockFetchOnce(400, { non_field_errors: ['This reset link is invalid or has expired.'] });

      const store = makeStore();
      const result = await store.dispatch(
        confirmPasswordReset({ uid: 'MQ', token: 'stale-token', newPassword: 'newpassword1' })
      );

      expect(confirmPasswordReset.rejected.match(result)).toBe(true);
      expect(result.payload).toBe('This reset link is invalid or has expired.');
    });
  });

  describe('refresh session', () => {
    async function loggedInStore() {
      const store = makeStore();
      mockFetchOnce(200, { user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' });
      await store.dispatch(login({ email: 'demo@revenact.io', password: 'demo1234' }));
      return store;
    }

    it('stores the rotated refresh token the backend returns', async () => {
      const store = await loggedInStore();
      mockFetchOnce(200, { access: 'access2.jwt', refresh: 'refresh2.jwt' });

      await store.dispatch(refreshSession());

      const state = store.getState().auth;
      expect(state.accessToken).toBe('access2.jwt');
      expect(state.refreshToken).toBe('refresh2.jwt');
      expect(localStorage.getItem('revenact_access_token')).toBe('access2.jwt');
      expect(localStorage.getItem('revenact_refresh_token')).toBe('refresh2.jwt');
    });

    it('keeps the existing refresh token when the reply has none', async () => {
      const store = await loggedInStore();
      mockFetchOnce(200, { access: 'access2.jwt' });

      await store.dispatch(refreshSession());

      expect(store.getState().auth.refreshToken).toBe('refresh.jwt');
      expect(localStorage.getItem('revenact_refresh_token')).toBe('refresh.jwt');
    });

    it('logs out when the refresh token is rejected', async () => {
      const store = await loggedInStore();
      mockFetchOnce(401, { detail: 'Token is blacklisted', code: 'token_not_valid' });

      await store.dispatch(refreshSession());

      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.refreshToken).toBeNull();
      expect(localStorage.getItem('revenact_refresh_token')).toBeNull();
    });
  });

  describe('logout', () => {
    async function loggedInStore() {
      mockFetchOnce(200, { user: mockUser, access: 'access.jwt', refresh: 'refresh.jwt' });
      const store = makeStore();
      await store.dispatch(login({ email: 'demo@revenact.io', password: 'demo1234' }));
      return store;
    }

    it('clears state and localStorage immediately, and blacklists the refresh token', async () => {
      const store = await loggedInStore();
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 205, json: async () => null });
      vi.stubGlobal('fetch', fetchMock);

      await store.dispatch(logout());

      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem('revenact_access_token')).toBeNull();
      expect(localStorage.getItem('revenact_user')).toBeNull();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout/'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer access.jwt' }),
          body: JSON.stringify({ refresh: 'refresh.jwt' }),
        })
      );
    });

    it("forgets the workspace's members, so the next person signed in reads their own", async () => {
      resetMembersCache();
      const store = await loggedInStore();
      mockFetchOnce(200, [{ id: 1, name: 'Alice' }]);
      expect(await loadMembers()).toEqual([{ id: 1, name: 'Alice' }]);
      store.dispatch(loggedOut());
      mockFetchOnce(200, [{ id: 9, name: 'Zed' }]);
      expect(await loadMembers()).toEqual([{ id: 9, name: 'Zed' }]);
      resetMembersCache();
    });

    it('still logs out client-side even if the server call fails', async () => {
      const store = await loggedInStore();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      await store.dispatch(logout());

      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(localStorage.getItem('revenact_access_token')).toBeNull();
    });
  });

  it('clearError resets the error message', async () => {
    mockFetchOnce(401, { detail: 'No active account found with the given credentials' });

    const store = makeStore();
    await store.dispatch(login({ email: 'demo@revenact.io', password: 'wrong' }));
    expect(store.getState().auth.error).not.toBeNull();

    store.dispatch(clearError());
    expect(store.getState().auth.error).toBeNull();
  });
});

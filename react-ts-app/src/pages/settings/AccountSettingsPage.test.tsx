import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import settingsReducer from '../../features/settings/settingsSlice';
import { AccountSettingsPage } from './AccountSettingsPage';

// jsdom has no canvas; the QR is a picture of the server's URI and is not
// what these tests are about.
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,stub' } }));
import { ALL_CAPABILITIES } from '../../test/capabilities';

const baseUser = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice Admin',
  avatar: '',
  role: 'admin',
  role_id: 1,
  role_name: 'Admin',
  permissions: ALL_CAPABILITIES,
  function: 'cs' as const,
  function_display: 'Customer Success',
  reports_to: null,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc' },
  is_active: true,
};

function renderPage(user: Partial<typeof baseUser> & Record<string, unknown> = {}) {
  const store = configureStore({
    reducer: { auth: authReducer, settings: settingsReducer },
    preloadedState: {
      auth: {
        user: { ...baseUser, ...user } as User,
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <AccountSettingsPage />
    </Provider>
  );
  return store;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

describe('Account settings', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a change-password submission when the new passwords do not match', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage({ has_password: true });

    await user.type(screen.getByLabelText('Current password'), 'supersecret1');
    await user.type(screen.getByLabelText('New password'), 'newpassword-12');
    await user.type(screen.getByLabelText('Confirm new password'), 'somethingelse1');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('The new passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changes the password through the backend when the form is consistent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, null));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage({ has_password: true });

    await user.type(screen.getByLabelText('Current password'), 'supersecret1');
    await user.type(screen.getByLabelText('New password'), 'newpassword-12');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpassword-12');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me/change-password/'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ current_password: 'supersecret1', new_password: 'newpassword-12' }),
      })
    );
  });

  it('shows how a provider-only person signs in instead of a password form', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPage({ has_password: false, sign_in_providers: ['google'] });

    expect(screen.getByText('How you sign in')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('enrols an authenticator app and shows the recovery codes once', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/mfa/setup/')) {
        return jsonResponse(200, { secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/Revenact:alice%40acme.io?secret=JBSWY3DPEHPK3PXP&issuer=Revenact' });
      }
      if (String(url).includes('/mfa/confirm/')) {
        return jsonResponse(200, { recovery_codes: ['abcde-fghjk', 'mnpqr-stuvw'] });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const store = renderPage({ has_password: true, mfa_enrolled: false });

    await user.click(screen.getByRole('button', { name: 'Set up an authenticator app' }));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/enter the six-digit code/i), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));

    expect(await screen.findByText('abcde-fghjk')).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();
    expect(store.getState().auth.user?.mfa_enrolled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me/mfa/confirm/'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: '123456' }) })
    );
  });

  it('turning two-factor off needs a current code', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/mfa/disable/')) return jsonResponse(200, { enrolled: false });
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const store = renderPage({ has_password: true, mfa_enrolled: true });

    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    await user.type(screen.getByLabelText(/a current code/i), '654321');
    await user.click(screen.getByRole('button', { name: 'Turn off two-factor' }));

    await waitFor(() => expect(store.getState().auth.user?.mfa_enrolled).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me/mfa/disable/'),
      expect.objectContaining({ body: JSON.stringify({ code: '654321' }) })
    );
  });

  it('assumes a password for a user cached before the field existed', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPage();

    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
  });
});

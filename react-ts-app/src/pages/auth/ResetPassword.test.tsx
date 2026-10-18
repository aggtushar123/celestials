import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { ResetPassword } from './ResetPassword';

function renderResetPassword(search = '?uid=MQ&token=a-valid-token') {
  render(
    <Provider store={configureStore({ reducer: { auth: authReducer } })}>
      <MemoryRouter initialEntries={[`/reset-password${search}`]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('ResetPassword page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('resets the password on a valid uid/token and offers a way back to login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ detail: 'Your password has been reset.' }),
      })
    );
    const user = userEvent.setup();

    renderResetPassword();
    await user.type(screen.getByLabelText('New password'), 'newpassword1');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('Password reset')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/password-reset/confirm/'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ uid: 'MQ', token: 'a-valid-token', new_password: 'newpassword1' }),
      })
    );

    const user2 = userEvent.setup();
    await user2.click(screen.getByRole('link', { name: /Back to Login/ }));
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });

  it('shows the backend error on an invalid/expired token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ non_field_errors: ['This reset link is invalid or has expired.'] }),
      })
    );
    const user = userEvent.setup();

    renderResetPassword();
    await user.type(screen.getByLabelText('New password'), 'newpassword1');
    await user.type(screen.getByLabelText('Confirm new password'), 'newpassword1');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('This reset link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.queryByText('Password reset')).not.toBeInTheDocument();
  });

  it('validates password length and confirmation match client-side', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();

    renderResetPassword();
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('New password'));
    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('New password'), 'newpassword1');
    await user.type(screen.getByLabelText('Confirm new password'), 'somethingelse1');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows an invalid-link state when the URL is missing uid/token, without calling the backend', () => {
    vi.stubGlobal('fetch', vi.fn());

    renderResetPassword('');

    expect(screen.getByText('Invalid reset link')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});

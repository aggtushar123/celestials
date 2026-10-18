import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { ForgotPassword } from './ForgotPassword';

function renderForgotPassword() {
  render(
    <Provider store={configureStore({ reducer: { auth: authReducer } })}>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('ForgotPassword page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the generic "check your email" panel on a known address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ detail: "If an account exists for that email, we've sent a password reset link." }),
      })
    );
    const user = userEvent.setup();

    renderForgotPassword();
    await user.type(screen.getByPlaceholderText('Email Address'), 'alice@acme.io');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('alice@acme.io')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/password-reset/'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'alice@acme.io' }) })
    );
  });

  it('shows the exact same panel for an email the backend says nothing exists for', async () => {
    // The backend always 200s regardless of whether the address is
    // registered (see API_CONTRACTS.md) — this page must not distinguish
    // the two either, or it defeats the point.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ detail: "If an account exists for that email, we've sent a password reset link." }),
      })
    );
    const user = userEvent.setup();

    renderForgotPassword();
    await user.type(screen.getByPlaceholderText('Email Address'), 'nobody@nowhere.io');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
  });

  it('validates the email client-side before calling the backend', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();

    renderForgotPassword();
    await user.type(screen.getByPlaceholderText('Email Address'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a server error when the request cannot reach the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const user = userEvent.setup();

    renderForgotPassword();
    await user.type(screen.getByPlaceholderText('Email Address'), 'alice@acme.io');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Could not reach the server. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('links back to the login page', async () => {
    renderForgotPassword();
    const user = userEvent.setup();

    await user.click(screen.getByRole('link', { name: /Back to Login/ }));

    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { Profile } from './Profile';
import { ALL_CAPABILITIES } from '../../test/capabilities';

const mockUser = {
  id: 1,
  email: 'alice@acme.io',
  name: 'Alice Admin',
  // The backend sends no avatar (no uploads, never a third-party image).
  avatar: '',
  role: 'admin' as const,
  role_id: 1,
  role_name: 'Admin',
  permissions: ALL_CAPABILITIES,
  function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
  organisation: { id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)', default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional' },
  is_active: true,
};

function renderProfile() {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: mockUser,
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
      <Profile />
    </Provider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('Profile page', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows initials, not an image, when there is no avatar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, mockUser)));
    renderProfile();
    expect(await screen.findByText('A')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Alice Admin' })).toBeNull();
  });

  it('loads and displays the profile, then updates the name on save', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, mockUser)) // GET /me/ on mount
      .mockResolvedValueOnce(jsonResponse(200, { ...mockUser, name: 'Alice Renamed' })); // PATCH /me/
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderProfile();

    // The header card renders from the pre-loaded store immediately...
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Acme Inc')).toBeInTheDocument();

    // ...and fetchMe fires on mount to refresh it.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me/'),
        expect.objectContaining({ method: 'GET' })
      )
    );

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Alice Renamed');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Profile updated.')).toBeInTheDocument();
    // The header card reflects the update via the shared auth.user state.
    await waitFor(() => expect(screen.getAllByText('Alice Renamed').length).toBeGreaterThan(0));
  });

  it('email is not editable', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, mockUser)));
    renderProfile();

    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailInput.disabled).toBe(true);
  });

});

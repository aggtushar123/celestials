import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import notificationsReducer from '../features/notifications/notificationsSlice';
import { DashboardLayout } from './DashboardLayout';
import { capabilitiesForRole } from '../test/capabilities';

// The phone drawer (phone shell spec 2026-10-06, option A), end to end: the
// real Sidebar and Navbar (neither mocked, unlike DashboardLayout.test.tsx's
// own frame tests), proving the open state DashboardLayout owns actually
// reaches both of them and the route-change close behaviour it alone can
// provide. No access token: the layout fetches no notifications and opens
// no socket (same trick as DashboardLayout.test.tsx), and the Sidebar's own
// "CUSTOM OBJECTS" fetch is stubbed to an empty list.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function renderAt(url: string) {
  const store = configureStore({
    reducer: { auth: authReducer, notifications: notificationsReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'x@acme.io', name: 'X', avatar: '', role: 'csm', role_id: 1,
          role_name: 'CSM', permissions: capabilitiesForRole('csm'),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: null, refreshToken: null, isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div>Dashboard page</div>} />
            <Route path="/copilot" element={<div>Copilot page</div>} />
            <Route path="/users" element={<div>Users page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('DashboardLayout phone drawer (phone shell spec 2026-10-06, option A)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('fills the real viewport height, not h-screen', () => {
    renderAt('/dashboard');
    expect(document.querySelector('.flex.bg-surface')).toHaveClass('h-[100dvh]', 'w-full');
    expect(document.querySelector('.flex.bg-surface')).not.toHaveClass('h-screen', 'w-screen');
  });

  it('opens the real Sidebar as a dialog from the Navbar menu button, and closes it again', async () => {
    renderAt('/users');
    const menuButton = await screen.findByRole('button', { name: 'Open navigation' });

    await userEvent.click(menuButton);
    expect(await screen.findByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Close navigation' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes the drawer on a route change', async () => {
    renderAt('/users');
    const menuButton = await screen.findByRole('button', { name: 'Open navigation' });
    await userEvent.click(menuButton);
    await screen.findByRole('dialog', { name: 'Navigation' });

    // The Dashboard link lives inside the drawer itself.
    await userEvent.click(screen.getByRole('link', { name: 'Dashboard' }));

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders no Navbar on Copilot, but still a slim md:hidden bar with the menu button', async () => {
    renderAt('/copilot');
    await screen.findByText('Copilot page');
    expect(document.querySelector('header')).toBeNull();
    const menuButton = screen.getByRole('button', { name: 'Open navigation' });
    expect(menuButton.closest('div')).toHaveClass('md:hidden');

    await userEvent.click(menuButton);
    expect(await screen.findByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
  });

  // Review round 2, Minor 1: Tab already stays inside the drawer (trapTab),
  // but a screen reader's virtual cursor is not bound by that — the page
  // behind the dialog goes inert too while it's open.
  it('marks the page behind the dialog inert while open, and interactive again once closed', async () => {
    renderAt('/users');
    const page = await screen.findByText('Users page');
    const contentColumn = page.closest('[inert]') ?? page.parentElement!;
    expect(contentColumn).not.toHaveAttribute('inert');

    await userEvent.click(await screen.findByRole('button', { name: 'Open navigation' }));
    await screen.findByRole('dialog', { name: 'Navigation' });
    expect(document.querySelector('main')?.closest('[inert]')).not.toBeNull();

    await userEvent.click(await screen.findByRole('button', { name: 'Close navigation' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.querySelector('main')?.closest('[inert]')).toBeNull();
  });
});

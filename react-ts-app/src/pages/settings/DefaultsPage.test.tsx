import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { DefaultsPage } from './DefaultsPage';

// Integration tier (see the `testing` skill): the real auth slice (both
// sections dispatch updateOrganisation), the fetch boundary mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ORGANISATION = {
  id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
  default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
};

function renderPage(role: 'admin' | 'csm') {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1, role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: ORGANISATION, is_active: true,
        },
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <DefaultsPage />
    </Provider>,
  );
}

const sectionOf = (heading: string) => screen.getByRole('heading', { level: 2, name: heading }).closest('section')!;

describe('DefaultsPage (settings spec 2026-10-06 §3.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders Currency, Exchange rates for an admin, then New organisations, under one h1', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderPage('admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Defaults' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Currency', 'Exchange rates', 'New organisations']);
    await screen.findByText(/every customer is assumed to bill in USD/);
  });

  it('shows a member Currency and New organisations only', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderPage('csm');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Currency', 'New organisations']);
  });

  it('holds the currency for the save bar and saves the default stage at once, each with its own PATCH', async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, { ...ORGANISATION, ...JSON.parse(String(options.body)) }));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage('admin');
    await screen.findByText(/every customer is assumed to bill in USD/);
    const patches = () =>
      fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH').map(([, options]) => JSON.parse(String(options!.body)));

    await user.selectOptions(within(sectionOf('Currency')).getByLabelText('Currency'), 'GBP');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(patches()).toEqual([]);

    await user.selectOptions(within(sectionOf('New organisations')).getByLabelText('Default lifecycle stage'), 'live');
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(patches()).toEqual([{ default_lifecycle_stage: 'live' }]);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(patches()).toEqual([{ default_lifecycle_stage: 'live' }, { currency: 'GBP' }]);
  });

  it('tells a member without manage_org_settings once, with both fields disabled and no Save', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage('csm');
    expect(screen.getAllByText(/You don't have permission to change this/)).toHaveLength(1);
    const notice = screen.getByText("You don't have permission to change this.").closest('[data-part="settings-note"]')!;
    expect(notice).not.toHaveClass('bg-warning-dim');
    expect(notice.querySelector('svg')).toHaveClass('text-ink-faint');
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeDisabled();
    expect(screen.getByLabelText('Default lifecycle stage')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

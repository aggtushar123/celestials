import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { LifecycleDefaultSection } from './LifecycleDefaultSection';
import { capabilitiesForRole } from '../../test/capabilities';
import { SettingsDraftScope, ToastProvider } from '../../components/ui';

// Integration tier (see the `testing` skill): same convention as
// CurrencySection.test.tsx's own — a real Redux store, fetch boundary
// mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeStore(role: 'admin' | 'csm' = 'admin', defaultLifecycleStage = '') {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role,
          role_id: 1,
          role_name: role === 'admin' ? 'Admin' : 'CSM',
          permissions: capabilitiesForRole(role),
          function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
          organisation: {
            id: 1,
            name: 'Acme Inc',
            slug: 'acme-inc',
            currency: 'USD' as const,
            currency_display: 'US Dollar ($)',
            default_lifecycle_stage: defaultLifecycleStage,
            ai_agent_enabled: true,
            ai_agent_tone: 'professional' as const,
            ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token',
        refreshToken: 'refresh',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
}

function renderPage(store: ReturnType<typeof makeStore>) {
  render(
    <Provider store={store}>
      <ToastProvider>
        <SettingsDraftScope>
          <LifecycleDefaultSection />
        </SettingsDraftScope>
      </ToastProvider>
    </Provider>
  );
}

describe('LifecycleDefaultSection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows "no default" when the tenant has never set one', () => {
    renderPage(makeStore('admin', ''));
    expect(screen.getByLabelText('Default lifecycle stage')).toHaveValue('');
  });

  it("shows the tenant's own saved default", () => {
    renderPage(makeStore('admin', 'adoption'));
    expect(screen.getByLabelText('Default lifecycle stage')).toHaveValue('adoption');
  });

  const orgBody = (stage: string) => ({
    id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD', currency_display: 'US Dollar ($)', default_lifecycle_stage: stage,
  });
  const patchBodies = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([, o]) => o?.method === 'PATCH').map(([, o]) => JSON.parse(String(o.body)));

  it('saves the default stage the moment it is chosen, with an Undo', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string; body?: string }) =>
      Promise.resolve(jsonResponse(200, orgBody(JSON.parse(String(options?.body)).default_lifecycle_stage))),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(makeStore('admin', ''));

    await user.selectOptions(screen.getByLabelText('Default lifecycle stage'), 'kickoff');
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(patchBodies(fetchMock)).toEqual([{ default_lifecycle_stage: 'kickoff' }]);
    expect(screen.getByLabelText('Default lifecycle stage')).toHaveValue('kickoff');
    expect(screen.queryByText('Unsaved changes')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByLabelText('Default lifecycle stage')).toHaveValue(''));
    expect(patchBodies(fetchMock)).toEqual([{ default_lifecycle_stage: 'kickoff' }, { default_lifecycle_stage: '' }]);
  });

  it('shows a refused save under the row and keeps the saved stage', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(400, { default_lifecycle_stage: ['Not an allowed stage.'] })));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'adoption'));

    await user.selectOptions(screen.getByLabelText('Default lifecycle stage'), 'live');

    const select = screen.getByLabelText('Default lifecycle stage');
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'));
    expect(select.getAttribute('aria-describedby')).toContain('default-stage-error');
    expect(document.getElementById('default-stage-error')).toHaveTextContent(/\S/);
    expect(select).toHaveValue('adoption');
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(patchBodies(fetchMock)).toEqual([{ default_lifecycle_stage: 'live' }]);
  });

  it('says where a new organisation starts without a default, in the hint', () => {
    renderPage(makeStore('admin', ''));
    expect(screen.getByRole('option', { name: 'No default' })).toBeInTheDocument();
    expect(screen.getByText(/With no default it starts at Onboarding/)).toBeInTheDocument();
  });

  it('a CSM sees a read-only view with no Save button', () => {
    renderPage(makeStore('csm', 'live'));

    expect(screen.getByLabelText('Default lifecycle stage')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { GlobalConfigSection } from './GlobalConfigSection';
import { capabilitiesForRole } from '../../test/capabilities';

const organisation = {
  id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
  default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
  global_attributes: { arr: 'arr_billed_at_account', mrr: 'arr_billed_at_account', renewal_date: 'renewal_date', joined_date: 'joined_date' },
  global_attribute_choices: {
    arr: ['arr_billed_at_account', 'arr_billed_at_hq', 'total_contract_value'],
    mrr: ['arr_billed_at_account', 'arr_billed_at_hq', 'total_contract_value'],
    renewal_date: ['renewal_date', 'contract_end_date'],
    joined_date: ['joined_date', 'contract_start_date', 'created_at'],
  },
};

const user = (role: 'admin' | 'csm') => ({
  id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1,
  role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
  function: 'leadership' as const, function_display: 'Leadership', reports_to: null,
  organisation, is_active: true,
});

function renderCard(role: 'admin' | 'csm') {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    if (String(url).includes('/auth/me/')) return Promise.resolve({ ok: true, status: 200, json: async () => user(role) });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...organisation, name: body.name ?? organisation.name, global_attributes: { ...organisation.global_attributes, ...(body.global_attributes ?? {}) } }) });
  });
  vi.stubGlobal('fetch', spy);
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: user(role),
        accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
      },
    },
  });
  render(
    <Provider store={store}>
      <GlobalConfigSection />
    </Provider>
  );
  return { spy, store };
}

describe('GlobalConfigSection', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('shows the saved name and mapping with human names, and saves a change', async () => {
    const { spy, store } = renderCard('admin');
    const user = userEvent.setup();

    expect(screen.getByLabelText(/Organization name/)).toHaveValue('Acme Inc');
    expect(screen.getByLabelText(/Organization ARR/)).toHaveDisplayValue('ARR (Billed at Account)');
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');

    await user.selectOptions(screen.getByLabelText(/Organization ARR/), 'total_contract_value');
    await user.clear(screen.getByLabelText(/Organization name/));
    await user.type(screen.getByLabelText(/Organization name/), 'Acme Corp');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(store.getState().auth.user?.organisation.name).toBe('Acme Corp'));
    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      name: 'Acme Corp',
      global_attributes: { arr: 'total_contract_value', mrr: 'arr_billed_at_account', renewal_date: 'renewal_date', joined_date: 'joined_date' },
    });
    expect(await within(screen.getByRole('status')).findByText('Saved.')).toBeInTheDocument();
  });

  it('resets unsaved edits to what the server has', async () => {
    renderCard('admin');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/Renewal date/), 'contract_end_date');
    expect(screen.getByLabelText(/Renewal date/)).toHaveDisplayValue('Contract End Date');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText(/Renewal date/)).toHaveDisplayValue('Renewal Date');
  });

  it('is read-only without manage_org_settings', () => {
    renderCard('csm');
    expect(screen.getByText(/Read-only/).closest('[data-part="settings-note"]')).not.toBeNull();
    expect(screen.getByLabelText(/Organization name/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('lays the configuration out as rows in one section, Save in its footer with a status region that stays', async () => {
    renderCard('admin');
    const user = userEvent.setup();
    const section = screen.getByRole('region', { name: 'Global configuration' });
    expect(within(section).getByLabelText(/Organization ARR/)).toHaveClass('appearance-none');
    const region = within(section).getByRole('status');
    const save = within(section).getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('border-t', 'justify-end');
    await user.selectOptions(within(section).getByLabelText(/Organization ARR/), 'total_contract_value');
    await user.click(save);
    await waitFor(() => expect(region).toHaveTextContent('Saved.'));
    expect(within(section).getByRole('status')).toBe(region);
  });
});

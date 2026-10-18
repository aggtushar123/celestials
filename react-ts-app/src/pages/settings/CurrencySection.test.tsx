import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { CurrencySection } from './CurrencySection';
import { capabilitiesForRole } from '../../test/capabilities';
import { SettingsDraftScope, ToastProvider } from '../../components/ui';

// Integration tier (see the `testing` skill): a real Redux store (same
// convention as Profile.test.tsx's own — this page dispatches
// updateOrganisation, a thunk on the same slice) plus the fetch
// boundary mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeStore(role: 'admin' | 'csm' = 'admin', currency: 'USD' | 'EUR' = 'USD') {
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
            currency,
            currency_display: currency === 'USD' ? 'US Dollar ($)' : 'Euro (€)',
            default_lifecycle_stage: '',
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

const rateLine = (text: string) => (_: string, element: Element | null) => element?.tagName === 'P' && element.textContent === text;

function renderPage(store: ReturnType<typeof makeStore>) {
  render(
    <Provider store={store}>
      <ToastProvider>
        <SettingsDraftScope>
          <CurrencySection />
        </SettingsDraftScope>
      </ToastProvider>
    </Provider>
  );
}

describe('CurrencySection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the tenant's own current currency", async () => {
    // Exchange Rates fetches GET /fx-rates/ on mount for an admin (see
    // FxRateListCreateView's own IsOrgAdmin-on-GET-too gate) — stubbed
    // to an empty list since this test isn't about that section.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderPage(makeStore('admin', 'EUR'));
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue('EUR');
    expect(screen.getByText('€12,345.00')).toBeInTheDocument();
    await screen.findByText(/every customer is assumed to bill in EUR/);
  });

  it('an admin can change the currency and save it from the save bar', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, {
          id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'GBP', currency_display: 'British Pound (£)', default_lifecycle_stage: '',
        }));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'GBP');
    expect(screen.getByText('£12,345.00')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    const patchCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH')!;
    const [, options] = patchCall as [string, { body: string }];
    expect(JSON.parse(options.body)).toEqual({ currency: 'GBP' });
  });

  it('shows a refused currency save under the row and keeps it in the save bar', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) =>
      Promise.resolve(options?.method === 'PATCH' ? jsonResponse(400, { currency: ['Pick a supported currency.'] }) : jsonResponse(200, [])),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'GBP');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const select = screen.getByRole('combobox', { name: 'Currency' });
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'));
    const message = document.getElementById(select.getAttribute('aria-describedby')!)!;
    expect(message).toHaveTextContent(/\S/);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('clears a refused currency error once another currency is chosen', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) =>
      Promise.resolve(options?.method === 'PATCH' ? jsonResponse(400, { currency: ['Pick a supported currency.'] }) : jsonResponse(200, [])),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'GBP');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const select = screen.getByRole('combobox', { name: 'Currency' });
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'));

    await user.selectOptions(select, 'EUR');
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).not.toHaveAttribute('aria-describedby');
  });

  it('Discard puts the saved currency back and sends nothing', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));
    await screen.findByText(/every customer is assumed to bill in USD/);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'GBP');
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue('USD');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it('a CSM sees a read-only view with no Save button and never fetches exchange rates', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage(makeStore('csm', 'USD'));

    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    // Exchange Rates is admin-only both ways server-side (IsOrgAdmin on
    // GET too) — a CSM can't even fetch the list, so this page doesn't
    // render the section or attempt to at all.
    expect(screen.queryByRole('region', { name: 'Exchange rates' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('Exchange Rates', () => {
    it('shows the empty state when no rates are configured', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
      renderPage(makeStore('admin', 'USD'));
      expect(await screen.findByText(/every customer is assumed to bill in USD/)).toBeInTheDocument();
    });

    it('lists configured rates', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [
        { id: 1, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.080000', updated_at: '2026-09-04T00:00:00Z' },
      ]))));
      renderPage(makeStore('admin', 'USD'));
      expect(await screen.findByText(rateLine('1 EUR = 1.080000 USD'))).toBeInTheDocument();
    });

    it('adding a rate POSTs for real and appends it to the list', async () => {
      const created = { id: 2, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.080000', updated_at: '2026-09-04T00:00:00Z' };
      const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
        if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, created));
        return Promise.resolve(jsonResponse(200, []));
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));

      await screen.findByText(/every customer is assumed to bill in USD/);
      await user.click(screen.getByRole('button', { name: 'Add rate' }));
      const form = screen.getByRole('form', { name: 'New exchange rate' });
      await user.selectOptions(within(form).getByLabelText('Currency'), 'EUR');
      await user.type(within(form).getByLabelText('1 EUR in USD'), '1.08');
      await user.click(within(form).getByRole('button', { name: 'Add rate' }));

      expect(await screen.findByText(rateLine('1 EUR = 1.080000 USD'))).toBeInTheDocument();
      const postCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST')!;
      expect(JSON.parse((postCall[1] as { body: string }).body)).toEqual({
        currency: 'EUR',
        rate_to_org_currency: '1.08',
      });
    });

    it('editing a rate PATCHes the new value in place', async () => {
      const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
        if (options?.method === 'PATCH') {
          return Promise.resolve(jsonResponse(200, {
            id: 1, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.120000', updated_at: '2026-09-04T00:00:00Z',
          }));
        }
        return Promise.resolve(jsonResponse(200, [
          { id: 1, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.080000', updated_at: '2026-09-04T00:00:00Z' },
        ]));
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));

      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      await user.click(screen.getByRole('button', { name: 'Edit rate for EUR' }));
      const input = screen.getByDisplayValue('1.080000');
      await user.clear(input);
      await user.type(input, '1.12');
      await user.click(screen.getByRole('button', { name: 'Save rate' }));

      expect(await screen.findByText(rateLine('1 EUR = 1.120000 USD'))).toBeInTheDocument();
    });

    it('deleting a rate removes it after confirming', async () => {
      const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
        if (options?.method === 'DELETE') return Promise.resolve(jsonResponse(204, null));
        return Promise.resolve(jsonResponse(200, [
          { id: 1, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.080000', updated_at: '2026-09-04T00:00:00Z' },
        ]));
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));

      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      await user.click(screen.getByRole('button', { name: 'More actions for EUR' }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
      await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete' }));

      expect(await screen.findByText(/every customer is assumed to bill in USD/)).toBeInTheDocument();
    });

    it('warns that saving a currency change will clear existing rates', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [
        { id: 1, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.08', updated_at: '2026-09-04T00:00:00Z' },
      ]))));
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));

      await screen.findByText(rateLine('1 EUR = 1.08 USD'));
      expect(screen.queryByText(/Saving will clear/)).not.toBeInTheDocument();

      await user.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'GBP');
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
      const warning = screen.getByText(/Saving clears your 1 exchange rate/);
      expect(warning.closest('[data-part="settings-note"]')).not.toBeNull();
    });
  });
});

const EUR_RATE = { id: 1, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.080000', updated_at: '2026-09-04T00:00:00Z' };

describe('Currency on the settings frame (UI foundations spec §6.3, §7)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts the currency in a row with the preview figure, and its Save in the page save bar whose status region stays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { method?: string }) =>
        Promise.resolve(
          options?.method === 'PATCH'
            ? jsonResponse(200, { id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'GBP', currency_display: 'British Pound (£)', default_lifecycle_stage: '' })
            : jsonResponse(200, []),
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));
    const currency = screen.getByRole('region', { name: 'Currency' });
    expect(within(currency).getByLabelText('Currency')).toHaveClass('appearance-none');
    expect(within(currency).getByText('$12,345.00')).toHaveClass('tabular-nums');
    expect(within(currency).queryByRole('button', { name: 'Save' })).toBeNull();
    const region = document.querySelector('[data-part="save-bar"] [role="status"]')!;
    await user.selectOptions(within(currency).getByLabelText('Currency'), 'GBP');
    expect(region).toHaveTextContent('Unsaved changes');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(region).toHaveTextContent('Saved.'));
    expect(region).not.toHaveClass('text-success');
    expect(document.querySelector('[data-part="save-bar"] [role="status"]')).toBe(region);
  });

  it('lists exchange rates as rows with Edit shown on hover and Delete last in the row menu', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [EUR_RATE]))));
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));
    const rates = await screen.findByRole('list', { name: 'Exchange rates' });
    const row = within(rates).getByText(rateLine('1 EUR = 1.080000 USD')).closest('li')!;
    expect(within(row).getByText('1.080000')).toHaveClass('tabular-nums');
    expect(within(row).getByRole('button', { name: 'Edit rate for EUR' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    await user.click(within(row).getByRole('button', { name: 'More actions for EUR' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.at(-1)).toHaveTextContent('Delete');
    expect(items.at(-1)).toHaveClass('text-danger-ink');
  });

  it('returns focus to the row menu when the delete is cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [EUR_RATE]))));
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));
    await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
    const more = screen.getByRole('button', { name: 'More actions for EUR' });
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(more).toHaveFocus());
  });
  describe('keyboard focus', () => {
    function ratesFetch(initial: unknown[]) {
      return vi.fn((_url: string, options?: { method?: string }) => {
        if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, EUR_RATE));
        if (options?.method === 'PATCH') return Promise.resolve(jsonResponse(200, { ...EUR_RATE, rate_to_org_currency: '1.120000' }));
        if (options?.method === 'DELETE') return Promise.resolve(jsonResponse(204, {}));
        return Promise.resolve(jsonResponse(200, initial));
      });
    }

    it('moves focus to the form Currency select when Add rate opens, and back to Add rate on cancel', async () => {
      vi.stubGlobal('fetch', ratesFetch([]));
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(/every customer is assumed to bill in USD/);
      await user.click(screen.getByRole('button', { name: 'Add rate' }));
      const form = screen.getByRole('form', { name: 'New exchange rate' });
      expect(within(form).getByLabelText('Currency')).toHaveFocus();
      await user.click(within(form).getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Add rate' })).toHaveFocus();
    });

    it('returns focus to Add rate after a successful add', async () => {
      vi.stubGlobal('fetch', ratesFetch([]));
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(/every customer is assumed to bill in USD/);
      await user.click(screen.getByRole('button', { name: 'Add rate' }));
      const form = screen.getByRole('form', { name: 'New exchange rate' });
      await user.selectOptions(within(form).getByLabelText('Currency'), 'EUR');
      await user.type(within(form).getByLabelText('1 EUR in USD'), '1.08');
      await user.click(within(form).getByRole('button', { name: 'Add rate' }));
      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      expect(screen.getByRole('button', { name: 'Add rate' })).toHaveFocus();
    });

    it('returns focus to the row Edit button after Save and after Cancel', async () => {
      vi.stubGlobal('fetch', ratesFetch([EUR_RATE]));
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      await user.click(screen.getByRole('button', { name: 'Edit rate for EUR' }));
      await user.click(screen.getByRole('button', { name: 'Cancel editing' }));
      expect(screen.getByRole('button', { name: 'Edit rate for EUR' })).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Edit rate for EUR' }));
      await user.click(screen.getByRole('button', { name: 'Save rate' }));
      await screen.findByText(rateLine('1 EUR = 1.120000 USD'));
      expect(screen.getByRole('button', { name: 'Edit rate for EUR' })).toHaveFocus();
    });

    async function deleteRate(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'More actions for EUR' }));
      await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }

    it('moves focus to the named rates list after a delete leaves rates', async () => {
      const GBP_RATE = { ...EUR_RATE, id: 2, currency: 'GBP', currency_display: 'Pound' };
      vi.stubGlobal('fetch', ratesFetch([EUR_RATE, GBP_RATE]));
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      await deleteRate(user);
      expect(screen.getByRole('list', { name: 'Exchange rates' })).toHaveFocus();
    });

    it('moves focus to Add rate after deleting the last rate', async () => {
      vi.stubGlobal('fetch', ratesFetch([EUR_RATE]));
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      await deleteRate(user);
      expect(screen.getByRole('button', { name: 'Add rate' })).toHaveFocus();
    });

    const rateFor = (id: number, currency: string) => ({ ...EUR_RATE, id, currency, currency_display: currency, rate_to_org_currency: '2.000000' });

    it('moves focus to the rates list after an add that uses the last free currency (Add rate is hidden then)', async () => {
      const five = ['EUR', 'GBP', 'INR', 'CAD', 'AUD'].map((code, index) => rateFor(index + 1, code));
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, options?: { method?: string }) =>
          Promise.resolve(options?.method === 'POST' ? jsonResponse(201, rateFor(9, 'JPY')) : jsonResponse(200, five)),
        ),
      );
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(rateLine('1 AUD = 2.000000 USD'));
      await user.click(screen.getByRole('button', { name: 'Add rate' }));
      const form = screen.getByRole('form', { name: 'New exchange rate' });
      await user.selectOptions(within(form).getByLabelText('Currency'), 'JPY');
      await user.type(within(form).getByLabelText('1 JPY in USD'), '2');
      await user.click(within(form).getByRole('button', { name: 'Add rate' }));
      await screen.findByText(rateLine('1 JPY = 2.000000 USD'));
      expect(screen.queryByRole('button', { name: 'Add rate' })).toBeNull();
      await waitFor(() => expect(screen.getByRole('list', { name: 'Exchange rates' })).toHaveFocus());
    });

    it('moves focus to the rates list after deleting the last rate while the add form hides Add rate', async () => {
      vi.stubGlobal('fetch', ratesFetch([EUR_RATE]));
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      await user.click(screen.getByRole('button', { name: 'Add rate' }));
      await deleteRate(user);
      await waitFor(() => expect(screen.getByRole('list', { name: 'Exchange rates' })).toHaveFocus());
    });

    it('keeps focus on the form Add rate while it adds (aria-disabled) and sends one POST for a double press', async () => {
      let release: () => void = () => {};
      const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
        if (options?.method === 'POST') return new Promise((resolve) => (release = () => resolve(jsonResponse(201, EUR_RATE))));
        return Promise.resolve(jsonResponse(200, []));
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderPage(makeStore('admin', 'USD'));
      await screen.findByText(/every customer is assumed to bill in USD/);
      await user.click(screen.getByRole('button', { name: 'Add rate' }));
      const form = screen.getByRole('form', { name: 'New exchange rate' });
      const submit = within(form).getByRole('button', { name: 'Add rate' });
      expect(submit).toHaveAttribute('aria-disabled', 'true');
      expect(submit).not.toBeDisabled();
      await user.click(submit);
      expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
      await user.selectOptions(within(form).getByLabelText('Currency'), 'EUR');
      await user.type(within(form).getByLabelText('1 EUR in USD'), '1.08');
      submit.focus();
      fireEvent.click(submit);
      fireEvent.click(submit);
      expect(submit).toHaveAttribute('aria-disabled', 'true');
      expect(submit).toHaveFocus();
      await act(async () => release());
      await screen.findByText(rateLine('1 EUR = 1.080000 USD'));
      expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
    });
  });
});

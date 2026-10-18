import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { CustomObjectRecordsPage } from './CustomObjectRecordsPage';
import { capabilitiesForRole } from '../../test/capabilities';

// Integration tier (see the `testing` skill): a real Redux store (the
// admin gate for ManageFieldsPanel's own mutation controls, same
// convention as WebhooksPage.test.tsx's own) + real router context;
// only the fetch boundary is mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const lineItemDefinition = {
  id: 4,
  name: 'Salesforce.com',
  api_name: 'salesforce_com',
  applies_to_customer: true,
  applies_to_account: true,
  fields: [
    { id: 9, name: 'Product', api_name: 'product', field_type: 'text', field_type_display: 'Text', is_required: true, picklist_options: [], order: 1, created_at: '2026-09-06T00:00:00Z' },
    { id: 10, name: 'Price', api_name: 'price', field_type: 'currency', field_type_display: 'Currency', is_required: false, picklist_options: [], order: 2, created_at: '2026-09-06T00:00:00Z' },
  ],
  records_count: 2,
  created_at: '2026-09-06T00:00:00Z',
};

function paginatedRecords(results: unknown[]) {
  return { count: results.length, next: null, previous: null, results };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    object_definition_id: 4,
    customer_id: 6,
    account_id: null,
    parent_name: 'Apple Inc',
    parent_type: 'customer',
    data: { product: 'Seat License', price: 12000 },
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
    ...overrides,
  };
}

function makeStore(role: 'admin' | 'csm' = 'admin') {
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

function renderPage(role: 'admin' | 'csm' = 'admin') {
  render(
    <Provider store={makeStore(role)}>
      <MemoryRouter initialEntries={['/custom-objects/4']}>
        <Routes>
          <Route path="/custom-objects/:id" element={<CustomObjectRecordsPage />} />
          <Route path="/organizations/:id" element={<div>ORG DETAIL PAGE</div>} />
          <Route path="/accounts/:id" element={<div>ACCOUNT DETAIL PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

function stubFetch(handler: (url: string, options?: RequestInit) => ReturnType<typeof jsonResponse> | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) => {
      const response = handler(url, options);
      return Promise.resolve(response ?? jsonResponse(404, { detail: 'unhandled in test' }));
    })
  );
}

describe('CustomObjectRecordsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every real record across the org with its own parent name', async () => {
    stubFetch((url) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, lineItemDefinition);
      if (url.includes('/records/')) {
        return jsonResponse(
          200,
          paginatedRecords([
            record(),
            { ...record({ id: 2, customer_id: null, account_id: 17, parent_name: 'North America', parent_type: 'account', data: { product: 'Add-on', price: 4000 } }) },
          ])
        );
      }
      if (url.endsWith('/customers/')) return jsonResponse(200, [{ id: 6, name: 'Apple Inc' }]);
      return undefined;
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Salesforce.com' })).toBeInTheDocument();
    expect(await screen.findByText('Apple Inc')).toBeInTheDocument();
    expect(screen.getByText('North America')).toBeInTheDocument();
    expect(screen.getByText('Seat License')).toBeInTheDocument();
    expect(screen.getByText('Add-on')).toBeInTheDocument();
  });

  it('clicking a customer-parented row navigates to its real Organization page', async () => {
    stubFetch((url) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, lineItemDefinition);
      if (url.includes('/records/')) return jsonResponse(200, paginatedRecords([record()]));
      if (url.endsWith('/customers/')) return jsonResponse(200, [{ id: 6, name: 'Apple Inc' }]);
      return undefined;
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByText('Apple Inc'));

    expect(await screen.findByText('ORG DETAIL PAGE')).toBeInTheDocument();
  });

  it('clicking an account-parented row navigates to its real Account page', async () => {
    stubFetch((url) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, lineItemDefinition);
      if (url.includes('/records/')) {
        return jsonResponse(
          200,
          paginatedRecords([record({ id: 2, customer_id: null, account_id: 17, parent_name: 'North America', parent_type: 'account' })])
        );
      }
      if (url.endsWith('/customers/')) return jsonResponse(200, []);
      return undefined;
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByText('North America'));

    expect(await screen.findByText('ACCOUNT DETAIL PAGE')).toBeInTheDocument();
  });

  it('shows an empty state when the object has no records yet', async () => {
    stubFetch((url) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, { ...lineItemDefinition, records_count: 0 });
      if (url.includes('/records/')) return jsonResponse(200, paginatedRecords([]));
      if (url.endsWith('/customers/')) return jsonResponse(200, []);
      return undefined;
    });

    renderPage();

    expect(await screen.findByText('No records yet.')).toBeInTheDocument();
  });

  it('shows the real backend error instead of crashing on a bad id', async () => {
    stubFetch(() => jsonResponse(404, { detail: 'Not found.' }));

    renderPage();

    expect(await screen.findByText('Not found.')).toBeInTheDocument();
  });

  it('a CSM can add a real record here, picking a real parent first', async () => {
    stubFetch((url, options) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, { ...lineItemDefinition, records_count: 0 });
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        return jsonResponse(201, record({ id: 3, customer_id: body.customer_id, parent_name: 'Globex Corp', data: body.data }));
      }
      if (url.includes('/records/')) return jsonResponse(200, paginatedRecords([]));
      if (url.endsWith('/customers/')) return jsonResponse(200, [{ id: 8, name: 'Globex Corp' }]);
      return undefined;
    });
    const user = userEvent.setup();

    renderPage('csm');
    await user.click(await screen.findByRole('button', { name: /Add record/ }));
    await user.selectOptions(screen.getByLabelText('Organization'), '8');
    await user.type(screen.getByLabelText('Product'), 'Enterprise Plan');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Globex Corp')).toBeInTheDocument();
    expect(await screen.findByText('Enterprise Plan')).toBeInTheDocument();
  });

  it('editing a record saves real changes', async () => {
    stubFetch((url, options) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, lineItemDefinition);
      if (options?.method === 'PATCH') {
        const body = JSON.parse(options.body as string);
        return jsonResponse(200, record({ data: body.data }));
      }
      if (url.includes('/records/')) return jsonResponse(200, paginatedRecords([record()]));
      if (url.endsWith('/customers/')) return jsonResponse(200, []);
      return undefined;
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Seat License');

    await user.click(screen.getByRole('button', { name: 'Edit record' }));
    const productInput = screen.getByLabelText('Product');
    await user.clear(productInput);
    await user.type(productInput, 'Seat License Renewed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Seat License Renewed')).toBeInTheDocument();
  });

  it('deleting a record removes it after confirming', async () => {
    stubFetch((url, options) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, lineItemDefinition);
      if (options?.method === 'DELETE') return jsonResponse(204, null);
      if (url.includes('/records/')) return jsonResponse(200, paginatedRecords([record()]));
      if (url.endsWith('/customers/')) return jsonResponse(200, []);
      return undefined;
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Seat License');

    await user.click(screen.getByRole('button', { name: 'Delete record' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.queryByText('Seat License')).not.toBeInTheDocument();
  });

  it('an admin can manage this object’s own fields right here', async () => {
    stubFetch((url, options) => {
      // Checked before the plain GET-definition case below — a POST to
      // .../definitions/4/fields/ would otherwise also match
      // `url.includes('/definitions/4/')` and get the wrong response.
      if (options?.method === 'POST' && url.includes('/fields/')) {
        return jsonResponse(201, {
          id: 20,
          name: 'Quantity',
          api_name: 'quantity',
          field_type: 'number',
          field_type_display: 'Number',
          is_required: false,
          picklist_options: [],
          order: 1,
          created_at: '2026-09-06T00:00:00Z',
        });
      }
      if (url.includes('/definitions/4/')) return jsonResponse(200, { ...lineItemDefinition, fields: [], records_count: 0 });
      if (url.includes('/records/')) return jsonResponse(200, paginatedRecords([]));
      if (url.endsWith('/customers/')) return jsonResponse(200, []);
      return undefined;
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: /Add field/ }));
    await user.type(screen.getByPlaceholderText('Field name'), 'Quantity');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Quantity')).toBeInTheDocument();
  });

  it('a CSM sees the real fields but no field-management controls', async () => {
    stubFetch((url) => {
      if (url.includes('/definitions/4/')) return jsonResponse(200, lineItemDefinition);
      if (url.includes('/records/')) return jsonResponse(200, paginatedRecords([]));
      if (url.endsWith('/customers/')) return jsonResponse(200, []);
      return undefined;
    });

    renderPage('csm');

    expect(await screen.findByText('Product')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add field/ })).not.toBeInTheDocument();
  });
});

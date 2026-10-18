import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { CustomObjectsPage } from './CustomObjectsPage';
import { capabilitiesForRole } from '../../test/capabilities';

// Integration tier (see the `testing` skill): a real Redux store for
// the admin gate (same convention as WebhooksPage.test.tsx's own
// makeStore/renderPage) plus the fetch boundary mocked for the real
// customObjectsApi.ts calls. A real router context too now — each
// definition's own name is a real <Link> to its own page (see
// CustomObjectsPage.tsx's own docstring on why field/record management
// moved there instead of living here).

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function definition(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Opportunity Line Item',
    api_name: 'opportunity_line_item',
    applies_to_customer: false,
    applies_to_account: true,
    fields: [],
    records_count: 0,
    created_at: '2026-09-06T00:00:00Z',
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
      <MemoryRouter>
        <CustomObjectsPage />
      </MemoryRouter>
    </Provider>
  );
}

describe('CustomObjectsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('a CSM sees a read-only notice and never fetches', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderPage('csm');

    expect(screen.getByText(/You don't have permission to define custom objects/).closest('[data-part="settings-note"]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an admin sees the real list of the org’s own custom objects, each linking to its own page', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [definition()]))));

    renderPage();

    const link = await screen.findByRole('link', { name: 'Opportunity Line Item' });
    expect(link).toHaveAttribute('href', '/custom-objects/1');
    expect(screen.getAllByText('Accounts')[0]).toBeInTheDocument();
  });

  it('shows an empty state when the org has defined nothing yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));

    renderPage();

    expect(await screen.findByText('No custom objects yet.')).toBeInTheDocument();
  });

  it('creating a new object sends real applies_to flags and shows it in the list', async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        return Promise.resolve(jsonResponse(201, definition({ id: 2, ...body })));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('No custom objects yet.');

    await user.click(screen.getByRole('button', { name: 'New object' }));
    await user.type(screen.getByPlaceholderText('Opportunity line item'), 'Contract Clause');
    await user.click(screen.getByLabelText('Applies to Accounts'));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('link', { name: 'Contract Clause' })).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({
      name: 'Contract Clause',
      applies_to_customer: true,
      applies_to_account: true,
    });
  });

  it('deleting a definition removes it from the real list', async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve(jsonResponse(204, null));
      return Promise.resolve(jsonResponse(200, [definition()]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('link', { name: 'Opportunity Line Item' });

    await user.click(screen.getByRole('button', { name: 'Delete Opportunity Line Item' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No custom objects yet.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/custom-objects/definitions/1/'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('lists objects on the object grid: the name links, the figures right-aligned, Delete on hover', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [definition()]))));
    renderPage();
    const link = await screen.findByRole('link', { name: 'Opportunity Line Item' });
    const row = link.closest('li')!;
    expect(row).toHaveClass('@min-[44rem]:grid');
    expect(screen.getByRole('list', { name: 'Custom objects' }).closest('section')).toHaveClass('@container');
    expect(within(row).getByRole('button', { name: 'Delete Opportunity Line Item' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('puts focus in the Name field when New object opens, and back on the opener on Cancel', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No custom objects yet.');
    await user.click(screen.getByRole('button', { name: 'New object' }));
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'New object' })).toHaveFocus();
  });

  it('returns focus to New object after Create, and ignores Create while it is incomplete', async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, definition({ id: 2, name: 'Clause' })));
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No custom objects yet.');
    await user.click(screen.getByRole('button', { name: 'New object' }));
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    await user.click(create);
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0);
    await user.type(screen.getByLabelText('Name'), 'Clause');
    await user.click(create);
    await screen.findByRole('link', { name: 'Clause' });
    expect(screen.getByRole('button', { name: 'New object' })).toHaveFocus();
  });

  it('returns focus to the row’s Delete on cancel, and to the list after a delete (the opener when empty)', async () => {
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return Promise.resolve(jsonResponse(204, null));
      return Promise.resolve(jsonResponse(200, [definition(), definition({ id: 2, name: 'Contract Clause' })]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Contract Clause' });

    const first = screen.getByRole('button', { name: 'Delete Opportunity Line Item' });
    await user.click(first);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(first).toHaveFocus();

    await user.click(first);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('list', { name: 'Custom objects' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Delete Contract Clause' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New object' })).toHaveFocus());
  });
});

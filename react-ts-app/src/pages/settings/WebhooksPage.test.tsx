import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { WebhooksPage } from './WebhooksPage';
import { capabilitiesForRole } from '../../test/capabilities';

// Integration tier (see the `testing` skill): a real Redux store for
// role-gating (same convention as CurrencySection.test.tsx's own) plus
// the fetch boundary mocked for the real webhooksApi.ts calls.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function webhook(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    url: 'https://example.com/hook',
    event: 'customer.created',
    event_display: 'Organization Created',
    secret: 'shh',
    is_active: true,
    created_at: '2026-09-04T00:00:00Z',
    recent_deliveries: [],
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
      <WebhooksPage />
    </Provider>
  );
}

describe('WebhooksPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('a CSM sees a read-only notice and never fetches', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage('csm');

    expect(screen.getByText(/You don't have permission to view or manage webhooks/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no webhooks', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderPage();

    expect(await screen.findByText('No webhooks yet.')).toBeInTheDocument();
  });

  it('states the one event as a read-only line, not a choice', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('No webhooks yet.');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));

    expect(screen.getByText('Sends when: Organization created')).toBeInTheDocument();
    expect(screen.queryByText(/the only event available/)).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('lists real webhooks with their event and active state', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [webhook()]))));
    renderPage();

    expect(await screen.findByText('https://example.com/hook')).toBeInTheDocument();
    expect(screen.getByText(/Organization Created/)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch')).toHaveTextContent('On');
  });

  it('expanding a row shows its recent deliveries', async () => {
    const withDeliveries = webhook({
      recent_deliveries: [
        { id: 5, success: true, status_code: 200, error: '', sent_at: '2026-09-04T00:00:00Z' },
        { id: 6, success: false, status_code: null, error: 'Connection refused', sent_at: '2026-09-03T00:00:00Z' },
      ],
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [withDeliveries]))));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'https://example.com/hook' }));

    const deliveries = within(screen.getByText('Recent deliveries').parentElement!).getAllByRole('listitem');
    expect(deliveries[0]).toHaveTextContent('HTTP 200');
    expect(within(deliveries[0]).getByText('200')).toHaveClass('tabular-nums');
    expect(deliveries[1]).toHaveTextContent('Connection refused');
    expect(deliveries[1]).not.toHaveTextContent('HTTP');
  });

  it('adding a webhook POSTs for real and prepends it to the list', async () => {
    const created = webhook({ id: 2, url: 'https://new.example.com/hook' });
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, created));
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('No webhooks yet.');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));
    await user.type(screen.getByLabelText('URL'), 'https://new.example.com/hook');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('https://new.example.com/hook')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST')!;
    expect(JSON.parse((postCall[1] as { body: string }).body)).toEqual({
      url: 'https://new.example.com/hook',
      event: 'customer.created',
    });
  });

  it('toggling the switch PATCHes is_active', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string; body?: string }) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, webhook({ is_active: false })));
      }
      return Promise.resolve(jsonResponse(200, [webhook()]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('https://example.com/hook');
    await user.click(screen.getByRole('switch'));

    expect(await screen.findByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('deleting a webhook removes it after confirming', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
      if (options?.method === 'DELETE') return Promise.resolve(jsonResponse(204, null));
      return Promise.resolve(jsonResponse(200, [webhook()]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('https://example.com/hook');
    await user.click(screen.getByRole('button', { name: /Delete webhook for/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No webhooks yet.')).toBeInTheDocument();
  });

  it('surfaces a create error without adding a bogus row', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        return Promise.resolve(jsonResponse(400, { url: ['That URL resolves to a private or internal address, which isn\'t allowed.'] }));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('No webhooks yet.');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));
    await user.type(screen.getByLabelText('URL'), 'http://169.254.169.254/');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText(/private or internal address/)).toBeInTheDocument();
    expect(screen.getByText('No webhooks yet.')).toBeInTheDocument();
  });
});

describe('Webhooks on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists webhooks as rows: the URL as code, the ui Switch, Delete on hover', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [webhook()]))));
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Webhooks & API access' })).toHaveClass('text-[22px]');
    const list = await screen.findByRole('list', { name: 'Webhooks' });
    expect(within(list).getByText('https://example.com/hook')).toHaveClass('font-mono-brand');
    const toggle = within(list).getByRole('switch', { name: 'Webhook for https://example.com/hook' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveTextContent('On');
    expect(within(list).getByRole('button', { name: 'Delete webhook for https://example.com/hook' }).parentElement).toHaveClass('sm:opacity-0');
    expect(screen.getByRole('button', { name: 'Add webhook' })).not.toHaveClass('bg-accent');
  });

  it('opens a row as a disclosure and shows a failed delivery in the danger ink', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(200, [webhook({ recent_deliveries: [{ id: 7, success: false, status_code: null, error: 'Connection refused', sent_at: '2026-09-05T00:00:00Z' }] })]),
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    const open = await screen.findByRole('button', { name: 'https://example.com/hook' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await user.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Connection refused/)).toHaveClass('text-danger-ink');
  });

  it('tells a member once, with a lock and no box', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage('csm');
    const note = screen.getByText(/You don't have permission to view or manage webhooks/).closest('[data-part="settings-note"]')!;
    expect(note).not.toHaveClass('bg-warning-dim');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Webhooks keep keyboard focus where it was', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves into the URL field when the form opens, and back to Add webhook on cancel', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No webhooks yet.');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));
    expect(screen.getByLabelText('URL')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add webhook' })).toHaveFocus();
  });

  it('returns to Add webhook after a successful add', async () => {
    const created = webhook({ id: 2, url: 'https://new.example.com/hook' });
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { method?: string }) =>
        Promise.resolve(options?.method === 'POST' ? jsonResponse(201, created) : jsonResponse(200, [])),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No webhooks yet.');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));
    await user.type(screen.getByLabelText('URL'), 'https://new.example.com/hook');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('https://new.example.com/hook');
    expect(screen.getByRole('button', { name: 'Add webhook' })).toHaveFocus();
  });

  it('does not submit an empty URL (the Add button is aria-disabled, not disabled)', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No webhooks yet.');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    await user.click(add);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns to the Delete button when the delete is cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [webhook()]))));
    const user = userEvent.setup();
    renderPage();
    const del = await screen.findByRole('button', { name: /Delete webhook for/ });
    await user.click(del);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(del).toHaveFocus();
  });

  it('moves focus to the list after deleting one of several, and to Add webhook after the last', async () => {
    let rows = [webhook(), webhook({ id: 2, url: 'https://two.example.com/hook' })];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { method?: string }) => {
        if (options?.method === 'DELETE') return Promise.resolve(jsonResponse(204, null));
        return Promise.resolve(jsonResponse(200, rows));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete webhook for https://example.com/hook' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('https://example.com/hook')).toBeNull());
    expect(screen.getByRole('list', { name: 'Webhooks' })).toHaveFocus();
    rows = [];
    await user.click(screen.getByRole('button', { name: 'Delete webhook for https://two.example.com/hook' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await screen.findByText('No webhooks yet.');
    expect(screen.getByRole('button', { name: 'Add webhook' })).toHaveFocus();
  });
});

describe('Webhooks: toggles, reloads and the delivery panel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('a toggle that gets a 500 shows the alert in the row and leaves the switch as it was', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { method?: string }) =>
        Promise.resolve(options?.method === 'PATCH' ? jsonResponse(500, { detail: 'Server error.' }) : jsonResponse(200, [webhook()])),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Webhook for https://example.com/hook' });
    await user.click(toggle);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server error.');
    expect(alert).toHaveClass('text-danger-ink');
    expect(alert.closest('li')).toContainElement(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('a double toggle sends one PATCH', async () => {
    let release: () => void = () => {};
    const fetchMock = vi.fn((_url: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') return new Promise((resolve) => (release = () => resolve(jsonResponse(200, webhook({ is_active: false })))));
      return Promise.resolve(jsonResponse(200, [webhook()]));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Webhook for https://example.com/hook' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await act(async () => release());
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
  });

  it('Try again reads the webhooks again after a failed load', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { detail: 'Could not load.' }))
      .mockResolvedValueOnce(jsonResponse(200, [webhook()]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('https://example.com/hook')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names the panel in aria-controls only while it is open, and wraps a long delivery error', async () => {
    const long = 'x'.repeat(200);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, [webhook({ recent_deliveries: [{ id: 6, success: false, status_code: null, error: long, sent_at: '2026-09-03T00:00:00Z' }] })]))),
    );
    const user = userEvent.setup();
    renderPage();
    const disclosure = await screen.findByRole('button', { name: 'https://example.com/hook' });
    expect(disclosure).not.toHaveAttribute('aria-controls');
    await user.click(disclosure);
    const panel = document.getElementById(disclosure.getAttribute('aria-controls')!);
    expect(panel).not.toBeNull();
    expect(within(panel!).getByText(long)).toHaveClass('break-words');
    await user.click(disclosure);
    expect(disclosure).not.toHaveAttribute('aria-controls');
  });

  it('with the Add form open, deleting the last webhook moves focus to the Endpoints section', async () => {
    let rows = [webhook()];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { method?: string }) => {
        if (options?.method === 'DELETE') {
          rows = [];
          return Promise.resolve(jsonResponse(204, null));
        }
        return Promise.resolve(jsonResponse(200, rows));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('https://example.com/hook');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));
    await user.click(screen.getByRole('button', { name: 'Delete webhook for https://example.com/hook' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await screen.findByText('No webhooks yet.');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Endpoints' })).toHaveFocus());
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../../features/auth/authSlice';
import { ALL_CAPABILITIES } from '../../../test/capabilities';
import { DrillProvider } from './DrillContext';
import { useDrill } from './useDrill';
import { DrillPanel } from './DrillPanel';

// A minimal store with the auth currency the panel's money formatter reads
// (useOrgCurrency, src/hooks.ts:12, reads state.auth.user.organisation.currency)
// — same preloaded auth shape src/components/accounts/MetricsPanel.test.tsx uses.
function authStore() {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role: 'admin',
          role_id: 1,
          role_name: 'Admin',
          permissions: ALL_CAPABILITIES,
          function: 'cs' as const,
          function_display: 'Customer Success',
          reports_to: null,
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

// The panel only has a real matchMedia to read in a browser; jsdom has none
// (window.matchMedia is undefined), which DrillPanel treats as "not lg" —
// the tests that care about the `lg`/sheet distinction stub it explicitly,
// and every other test here relies on that same "missing = not lg" default.
function stubMatchMedia(matchesLarge: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matchesLarge,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  // @ts-expect-error -- undo the stub so later tests see jsdom's real "no matchMedia"
  delete window.matchMedia;
});

const rows = [
  { id: '3', name: 'Uber', owner: 'Carl CSM', arr: 42000, detail: '197 days to renewal' },
  { id: '7', name: 'Pizza Hut', owner: 'Carl CSM', arr: 38100, detail: '45 days overdue' },
];

function Opener() {
  const { open } = useDrill();
  return (
    <button onClick={(e) => open({ title: 'At risk', figure: '$114.5K', source: { kind: 'rows', rows } }, e.currentTarget)}>
      At risk
    </button>
  );
}

function renderPanel() {
  const store = authStore();
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <DrillProvider>
          <Opener />
          <DrillPanel />
        </DrillProvider>
      </MemoryRouter>
    </Provider>,
  );
}

describe('DrillPanel', () => {
  it('opens as a labelled dialog listing each company with a link', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    const dialog = screen.getByRole('dialog', { name: /At risk/ });
    expect(dialog).toHaveTextContent('$114.5K');
    expect(screen.getByRole('link', { name: 'Uber' })).toHaveAttribute('href', '/organizations/3');
    expect(screen.getByText('45 days overdue')).toBeInTheDocument();
  });

  it('offers Open as a list with every id', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    expect(screen.getByRole('link', { name: /Open as a list/ })).toHaveAttribute(
      'href',
      '/organizations/list?ids=3,7',
    );
  });

  it('moves focus in, closes on Escape and returns focus to the trigger', async () => {
    renderPanel();
    const trigger = screen.getByRole('button', { name: 'At risk' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('says so when a number has no companies behind it', async () => {
    function EmptyOpener() {
      const { open } = useDrill();
      return <button onClick={() => open({ title: 'Declining', figure: '0', source: { kind: 'rows', rows: [] } })}>Declining</button>;
    }
    const store = authStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <DrillProvider>
            <EmptyOpener />
            <DrillPanel />
          </DrillProvider>
        </MemoryRouter>
      </Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Declining' }));
    expect(screen.getByText('No accounts behind this number.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open as a list/ })).not.toBeInTheDocument();
  });

  it('is aria-modal and traps Tab inside the sheet below lg', async () => {
    stubMatchMedia(false);
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const closeButton = screen.getByRole('button', { name: 'Close' });
    const links = screen.getAllByRole('link');
    const last = links[links.length - 1];

    last.focus();
    await userEvent.tab();
    expect(closeButton).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('closes when the filter or area changes, without refocusing the old trigger', async () => {
    function Navigator() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate('/dashboard/health?owner=5')}>Change owner</button>
          <button onClick={() => navigate('/dashboard/forecast')}>Other area</button>
        </>
      );
    }
    const store = authStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard/health']}>
          <DrillProvider>
            <Opener />
            <Navigator />
            <DrillPanel />
          </DrillProvider>
        </MemoryRouter>
      </Provider>,
    );
    const trigger = screen.getByRole('button', { name: 'At risk' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const changeOwner = screen.getByRole('button', { name: 'Change owner' });
    changeOwner.focus();
    fireEvent.click(changeOwner);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).not.toHaveFocus();

    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Other area' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('at lg, Escape only closes the panel when focus is inside it', async () => {
    stubMatchMedia(true);
    renderPanel();
    const trigger = screen.getByRole('button', { name: 'At risk' });
    await userEvent.click(trigger);

    // Focus back on the page: Escape there belongs to the page, not the panel.
    trigger.focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    screen.getByRole('button', { name: 'Close' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('at lg, leaves an Escape something else already handled alone', async () => {
    stubMatchMedia(true);
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    const swallow = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.preventDefault();
    };
    document.addEventListener('keydown', swallow);
    try {
      screen.getByRole('button', { name: 'Close' }).focus();
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      document.removeEventListener('keydown', swallow);
    }
  });

  it('below lg, Escape closes the sheet wherever focus is', async () => {
    stubMatchMedia(false);
    renderPanel();
    const trigger = screen.getByRole('button', { name: 'At risk' });
    await userEvent.click(trigger);
    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not pull focus back to Close when the viewport crosses lg', async () => {
    const listeners = new Set<() => void>();
    let large = false;
    window.matchMedia = ((query: string) => ({
      get matches() {
        return large;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    const uber = screen.getByRole('link', { name: 'Uber' });
    uber.focus();

    large = true;
    act(() => listeners.forEach((fn) => fn()));

    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
    expect(uber).toHaveFocus();
  });

  it('leaves focus free between the panel and the page at lg', async () => {
    stubMatchMedia(true);
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));

    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal');
  });

  // Placement against the Ask rail (over it, or in its place) is covered in
  // drillPlacement.test.tsx, which renders the real DashboardFrame.

  it('offers no "Ask about these" outside the dashboard frame', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'At risk' }));
    expect(screen.getByRole('dialog', { name: /At risk/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask about these' })).not.toBeInTheDocument();
  });
});

// Server drill source (Task 3) — same fetch-stubbing pattern as
// src/components/shared/CustomObjectsTab.test.tsx: only the fetch boundary
// is mocked, drillApi.ts (and apiFetch under it) do the rest.
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(handler: (url: string) => ReturnType<typeof jsonResponse> | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(handler(url) ?? jsonResponse(404, { detail: 'unhandled in test' }))),
  );
}

function ServerOpener() {
  const { open } = useDrill();
  return (
    <button
      onClick={() =>
        open({
          title: 'Open tickets',
          figure: '42',
          source: { kind: 'server', path: '/tickets/summary', query: 'window=30d', segment: 'priority:high' },
        })
      }
    >
      Open tickets
    </button>
  );
}

function renderServerPanel() {
  const store = authStore();
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <DrillProvider>
          <ServerOpener />
          <DrillPanel />
        </DrillProvider>
      </MemoryRouter>
    </Provider>,
  );
}

describe('DrillPanel server source', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the query plus segment, shows Loading then the rows', async () => {
    stubFetch((url) => {
      expect(url).toContain('window=30d');
      expect(url).toContain('drill=priority%3Ahigh');
      return jsonResponse(200, {
        drill: {
          segment: 'priority:high',
          value_label: 'tickets',
          count: 1,
          truncated: false,
          companies: [{ id: 9, name: 'Wayne Enterprises', owner: 'Carl CSM', arr: 50000, value: 4 }],
        },
        currency: 'USD',
      });
    });

    renderServerPanel();
    // fireEvent (not userEvent) so the click's `act` flush happens before
    // the fetch promise settles — otherwise the loading state is already
    // gone by the time we assert on it.
    fireEvent.click(screen.getByRole('button', { name: 'Open tickets' }));

    expect(screen.getByText('Loading the accounts behind this number…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Wayne Enterprises' })).toHaveAttribute(
      'href',
      '/organizations/9',
    );
    expect(screen.getByText('4 tickets')).toBeInTheDocument();
  });

  it.each([
    ['tickets', 'Companies with at least one matching ticket. Tickets not linked to a company aren\'t listed, and a ticket on a shared account counts for each of its companies.'],
    ['interactions', 'Companies with at least one matching interaction. Interactions not linked to a company aren\'t listed, and an interaction on a shared account counts for each of its companies.'],
  ])('explains how %s reconcile to the company rows', async (label, note) => {
    stubFetch(() =>
      jsonResponse(200, {
        drill: {
          segment: 'priority:high',
          value_label: label,
          count: 1,
          truncated: false,
          companies: [{ id: 9, name: 'Wayne Enterprises', owner: null, arr: 50000, value: 4 }],
        },
        currency: 'USD',
      }),
    );

    renderServerPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Open tickets' }));

    const dialog = await screen.findByRole('dialog');
    const line = await within(dialog).findByText(note);
    expect(line.className).toContain('text-[11px]');
    expect(line.className).toContain('text-ink-muted');
  });

  it('adds no reconciliation note for a money drill', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        drill: {
          segment: 'at_risk',
          value_label: 'downside',
          count: 1,
          truncated: false,
          companies: [{ id: 9, name: 'Wayne Enterprises', owner: null, arr: 50000, value: 4 }],
        },
        currency: 'USD',
      }),
    );

    renderServerPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Open tickets' }));

    expect(await screen.findByRole('link', { name: 'Wayne Enterprises' })).toBeInTheDocument();
    expect(screen.queryByText(/Companies with at least one matching/)).not.toBeInTheDocument();
  });

  it('says the number cannot be listed when the backend sent no drill', async () => {
    stubFetch(() => jsonResponse(200, { kpis: { total: 42 }, currency: 'USD' }));

    renderServerPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Open tickets' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("This number can't be listed.");
    expect(screen.queryByText('Could not load the accounts behind this number.')).not.toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    stubFetch(() => jsonResponse(500, { detail: 'boom' }));

    renderServerPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Open tickets' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the accounts behind this number.');
  });

  it('shows the truncated count and hides Open as a list', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        drill: {
          segment: 'priority:high',
          value_label: 'tickets',
          count: 812,
          truncated: true,
          companies: [
            { id: 1, name: 'Company 1', owner: 'Carl CSM', arr: 1000, value: 1 },
            { id: 2, name: 'Company 2', owner: 'Carl CSM', arr: 1000, value: 1 },
            { id: 3, name: 'Company 3', owner: 'Carl CSM', arr: 1000, value: 1 },
          ],
        },
        currency: 'USD',
      }),
    );

    renderServerPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Open tickets' }));

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveTextContent('Showing 3 of 812'));
    expect(screen.queryByRole('link', { name: /Open as a list/ })).not.toBeInTheDocument();
  });
});

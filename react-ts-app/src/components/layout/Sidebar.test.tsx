import { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { calls } from '../../features/work/testWork';
import { stubFeed } from '../../features/work/testFeed';
import { Sidebar } from './Sidebar';
import { capabilitiesForRole } from '../../test/capabilities';

// Integration tier (see the `testing` skill): real store (auth for
// capability-gated items) + real
// router context; only the fetch boundary for the sidebar's own real
// "CUSTOM OBJECTS" section is mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeStore(role?: 'admin' | 'csm') {
  return configureStore({
    reducer: { auth: authReducer },
    ...(role
      ? {
          preloadedState: {
            auth: {
              user: {
                id: 1, email: 'x@acme.io', name: 'X', avatar: '', role, role_id: 1,
                role_name: role === 'admin' ? 'Admin' : 'CSM', permissions: capabilitiesForRole(role),
                function: 'cs' as const, function_display: 'Customer Success', reports_to: null,
                organisation: {
                  id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'USD' as const, currency_display: 'US Dollar ($)',
                  default_lifecycle_stage: '', ai_agent_enabled: true, ai_agent_tone: 'professional' as const, ai_agent_tone_display: 'Professional',
                },
                is_active: true,
              },
              accessToken: 'token', refreshToken: 'refresh', isAuthenticated: true, isLoading: false, error: null,
            },
          },
        }
      : {}),
  });
}

function renderSidebar(
  role?: 'admin' | 'csm',
  url = '/dashboard',
  drawer: { isOpen?: boolean; onClose?: () => void } = {},
) {
  render(
    <Provider store={makeStore(role)}>
      <MemoryRouter initialEntries={[url]}>
        <Sidebar isOpen={drawer.isOpen} onClose={drawer.onClose} />
      </MemoryRouter>
    </Provider>
  );
}

describe('Sidebar brand mark (review round 1, Critical)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  // `brand` (the rose chip) never flips with the theme, unlike `accent` —
  // so its text must stay pinned to `on-brand` (fixed white in both
  // themes), not `on-accent` (which flips to near-black in dark mode and
  // would render the mark unreadable there).
  it('labels the mark "R" with text-on-brand, not text-on-accent', async () => {
    renderSidebar();
    const mark = await screen.findByLabelText('Revenact');
    expect(mark).toHaveClass('bg-brand', 'text-on-brand');
    expect(mark).not.toHaveClass('text-on-accent');
  });
});

describe('Sidebar CUSTOM OBJECTS section', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the org’s own real custom object definitions, not a hardcoded SFDC item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(200, [
            { id: 4, name: 'Salesforce.com', api_name: 'salesforce_com', applies_to_customer: true, applies_to_account: true, fields: [], records_count: 2, created_at: '2026-09-06T00:00:00Z' },
          ])
        )
      )
    );

    renderSidebar();
    // The rail is icons only; every item carries its name as its
    // accessible name, and shows it in a pill on hover.
    expect(await screen.findByRole('link', { name: 'Salesforce.com' })).toHaveAttribute('href', '/custom-objects/4');
    expect(screen.queryByRole('link', { name: /SFDC Opportunity/ })).not.toBeInTheDocument();
  });

  it('renders no custom object items when the org has defined none yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));

    renderSidebar();
    await screen.findByRole('link', { name: 'Dashboard' });

    expect(screen.queryByRole('link', { name: /SFDC Opportunity/ })).not.toBeInTheDocument();
  });

  it('a failed fetch leaves the rest of the sidebar working', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'error' }))));

    renderSidebar();

    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });
});

describe('Sidebar hover labels', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('never widens; resting on an item shows its name in a pill, leaving hides it', async () => {
    renderSidebar();
    const rail = screen.getByRole('complementary');
    const dashboard = await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.hover(rail);
    expect(rail.className).not.toMatch(/w-\[240px\]/);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.hover(dashboard);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Dashboard');
    await userEvent.unhover(dashboard);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keyboard focus shows the name too', async () => {
    renderSidebar();
    const copilot = await screen.findByRole('link', { name: 'Copilot' });
    copilot.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Copilot');
    copilot.blur();
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('the account button shows the person’s name', async () => {
    renderSidebar('csm');
    const account = await screen.findByRole('button', { name: /account settings/i });
    await userEvent.hover(account);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('X');
  });
});

describe('Sidebar Brain item (brain UI spec 2026-10-06 §1.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('gives every member one Brain item to /brain, with no badge, and none of the four questions', async () => {
    const spy = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal('fetch', spy);
    renderSidebar('csm');
    const brain = await screen.findByRole('link', { name: 'Brain' });
    expect(brain).toHaveAttribute('href', '/brain');
    for (const name of ['What changed', 'Waiting on you', "What's being done", 'What customers are saying', 'Review Queue', 'Initiatives', 'Feature Requests', 'Anomalies', 'Knowledge Graph', 'Users']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(spy.mock.calls.some(([url]) => url.includes('/metrics/proposals/'))).toBe(false);
    expect(spy.mock.calls.some(([url]) => url.includes('/brain/waiting/count/'))).toBe(false);
  });

  it.each(['/brain', '/brain/doing', '/brain/customers', '/brain/requests', '/brain/anomalies', '/brain/graph'])('lights Brain on %s', async (url) => {
    renderSidebar('csm', url);
    expect(await screen.findByRole('link', { name: /^Brain/ })).toHaveAttribute('aria-current', 'page');
  });

  it('does not light Brain anywhere else', async () => {
    renderSidebar('csm', '/dashboard');
    expect(await screen.findByRole('link', { name: /^Brain/ })).not.toHaveAttribute('aria-current');
  });
});

// Segments spec 2026-10-03 §3: the Tools link reaches the real list, and
// stays lit on a segment, its builder and a new one.
describe('Sidebar NavItem aria-current (final wave item 10)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('is aria-current on /organizations/list, the page Organizations resolves to', async () => {
    renderSidebar('csm', '/organizations/list');
    expect(await screen.findByRole('link', { name: 'Organizations' })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['/organizations/board', '/organizations/42'])(
    'is highlighted but not aria-current on %s, which Organizations only lights for, never resolves to',
    async (url) => {
      renderSidebar('csm', url);
      const link = await screen.findByRole('link', { name: 'Organizations' });
      expect(link).not.toHaveAttribute('aria-current');
      expect(link.className).toMatch(/rv-sidebar-active-bg/);
    },
  );
});

describe('Sidebar Segments link', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it.each(['/segments', '/segments/new', '/segments/7', '/segments/7/edit'])('points at /segments and is the current page on %s', async (url) => {
    renderSidebar('csm', url);
    const link = await screen.findByRole('link', { name: 'Segments' });
    expect(link).toHaveAttribute('href', '/segments');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('is not the current page elsewhere', async () => {
    renderSidebar('csm', '/dashboard');
    expect(await screen.findByRole('link', { name: 'Segments' })).not.toHaveAttribute('aria-current');
  });
});

// Settings spec 2026-10-06 §1: Users and Integrations live under Settings
// now (People & teams, Connections); Settings stays where it is.
describe('Sidebar SETUP section', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('keeps Settings and drops Users and Integrations, even for an admin', async () => {
    renderSidebar('admin');
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Integrations' })).toBeNull();
  });

  it('lights Settings on every settings page, including the ones that moved in', async () => {
    renderSidebar('admin', '/settings/people');
    expect((await screen.findByRole('link', { name: 'Settings' })).className).toMatch(/rv-sidebar-active-bg/);
  });
});

/** A real opener button plus the Sidebar, the same shape DashboardLayout
 *  wires in production (phone shell spec 2026-10-06, option A): proves the
 *  drawer's own open/close/focus mechanics without needing the Navbar. */
function DrawerHarness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Provider store={makeStore('csm')}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <button type="button" onClick={() => setIsOpen(true)}>
          Open menu
        </button>
        <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </MemoryRouter>
    </Provider>
  );
}

describe('Sidebar phone drawer (phone shell spec 2026-10-06, option A)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('is closed by default: no dialog, no scrim, translated fully offscreen on phones', async () => {
    renderSidebar('csm');
    await screen.findByRole('link', { name: 'Dashboard' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.bg-scrim')).toBeNull();
    const aside = screen.getByRole('complementary');
    expect(aside.className).toMatch(/-translate-x-full/);
  });

  it('stays in flow at md and up regardless of open state (class names only — jsdom has no layout)', async () => {
    renderSidebar('csm');
    const aside = screen.getByRole('complementary');
    expect(aside.className).toMatch(/\bmd:static\b/);
    expect(aside.className).toMatch(/\bmd:translate-x-0\b/);
  });

  it('opens as a dialog over a scrim on its menu button', async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.querySelector('.bg-scrim')).not.toBeNull();
  });

  it('moves focus into the drawer on open, and back to the menu button on close', async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    const opener = screen.getByRole('button', { name: 'Open menu' });
    opener.focus();

    await userEvent.click(opener);
    const closeButton = await screen.findByRole('button', { name: 'Close navigation' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await userEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('closes on Escape', async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Navigation' });

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on a scrim click', async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Navigation' });

    await userEvent.click(document.querySelector('.bg-scrim') as HTMLElement);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('has a 44px Close button inside the drawer', async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const closeButton = await screen.findByRole('button', { name: 'Close navigation' });
    expect(closeButton.className).toMatch(/\bmin-h-11\b/);
    expect(closeButton.className).toMatch(/\bmin-w-11\b/);
  });

  it('gives the Close button a focus-visible style (Minor 7)', async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const closeButton = await screen.findByRole('button', { name: 'Close navigation' });
    expect(closeButton.className).toMatch(/focus-visible:outline/);
  });

  it('widens the rail (about w-64, capped at 85vw) while open, and back to 72px on close', async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const dialog = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(dialog).toHaveClass('w-64', 'max-w-[85vw]', 'md:w-[72px]');

    await userEvent.click(await screen.findByRole('button', { name: 'Close navigation' }));
    await waitFor(() => expect(screen.getByRole('complementary')).toHaveClass('w-[72px]'));
  });

  it("shows every item's visible name next to its icon while open on phones — a phone has no hover", async () => {
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Navigation' });

    for (const label of ['Copilot', 'Dashboard', 'Organizations', 'Accounts', 'Contacts', 'Pipelines', 'Settings', 'Lifecycle']) {
      const link = screen.getByRole('link', { name: label });
      expect(within(link).getByText(label)).toBeInTheDocument();
    }
  });

  it("shows no visible name while closed (the hover pill still carries it)", async () => {
    renderSidebar('csm');
    const dashboard = await screen.findByRole('link', { name: 'Dashboard' });
    expect(within(dashboard).queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('closes when the current page\'s own item is tapped (Minor 4: that click never changes the route, so no pathname effect fires)', async () => {
    function SamePageHarness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <Provider store={makeStore('csm')}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />
          </MemoryRouter>
        </Provider>
      );
    }
    render(<SamePageHarness />);
    const dashboard = await screen.findByRole('link', { name: 'Dashboard' });

    await userEvent.click(dashboard);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

// jsdom has no real matchMedia; these tests stub it the same way
// DrillPanel.test.tsx's own `stubMatchMedia` does, with real `change`
// dispatch so the resize-closes-the-drawer effect can actually be exercised.
function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '(min-width: 768px)',
    onchange: null,
    addEventListener: (_type: string, cb: (event: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: (event: { matches: boolean }) => void) => listeners.delete(cb),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
  window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches: next }));
    },
  };
}

describe('Sidebar drawer across the md breakpoint (review round 2, Minor 3 + Important 2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  afterEach(() => {
    // @ts-expect-error -- undo the stub so later tests see jsdom's real "no matchMedia"
    delete window.matchMedia;
  });

  it('is inert while closed below md, but never inert at md and up', () => {
    stubMatchMedia(false);
    renderSidebar('csm');
    expect(screen.getByRole('complementary')).toHaveAttribute('inert');

    stubMatchMedia(true);
    renderSidebar('csm');
    expect(screen.getAllByRole('complementary').at(-1)).not.toHaveAttribute('inert');
  });

  it('is never inert while open', async () => {
    stubMatchMedia(false);
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(await screen.findByRole('dialog', { name: 'Navigation' })).not.toHaveAttribute('inert');
  });

  it('closes itself and drops the dialog role when the viewport widens past md while open', async () => {
    const media = stubMatchMedia(false);
    render(<DrawerHarness />);
    await screen.findByRole('link', { name: 'Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Navigation' });

    act(() => media.setMatches(true));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('Sidebar Work item (work in one place §5: one badge)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('goes to My work, is lit on every Work route, and names what waits', async () => {
    stubFeed();
    renderSidebar('csm', '/work/team');
    const link = await screen.findByRole('link', { name: 'Work, 4 to decide, 1 overdue' });
    expect(link).toHaveAttribute('href', '/work');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(link).getByText('5')).toHaveClass('font-mono-brand');
  });

  it('shows no badge and no count at 0, and reads neither old count', async () => {
    const { spy } = stubFeed({ tasks: [], todos: [], decide: [], recommendations: [] });
    renderSidebar('csm', '/dashboard');
    await waitFor(() => expect(calls(spy, 'GET', '/work/feed/count/')).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByRole('link', { name: 'Work' }).querySelector('.bg-warning')).toBeNull();
    expect(calls(spy, 'GET', '/work/today/')).toEqual([]);
    expect(calls(spy, 'GET', '/work/recommendations/')).toEqual([]);
  });
});

describe('Sidebar top order (owner, 2026-10-17)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leads with Work, then Brain, Copilot and Dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
    renderSidebar('admin', '/work');
    await screen.findByRole('link', { name: 'Dashboard' });
    const top = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => /^\/(work|brain|copilot|dashboard)/.test(href))
      .map((href) => href.split(/[/?]/)[1]);
    expect(top.slice(0, 4)).toEqual(['work', 'brain', 'copilot', 'dashboard']);
  });
});

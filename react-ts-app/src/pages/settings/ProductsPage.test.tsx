import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { ProductsPage } from './ProductsPage';
import { capabilitiesForRole } from '../../test/capabilities';
import type { Product } from './productsApi';

// Integration tier, same convention as CurrencySection.test.tsx: a real auth
// store for the capability gate, the fetch boundary mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 1,
  name: 'Product A',
  is_active: true,
  customers: 5,
  created_at: '2026-09-12T13:51:02Z',
  updated_at: '2026-09-12T13:51:02Z',
  ...overrides,
});

const CATALOGUE = [
  product(),
  product({ id: 2, name: 'Legacy Suite', is_active: false, customers: 1 }),
  product({ id: 3, name: 'Pilot Add-on', customers: 0 }),
];

/** One mock for the whole page: GET returns the catalogue, everything else
 *  is routed by method so a test can assert on the write it caused. */
function mockApi(
  writes: Partial<Record<'POST' | 'PATCH' | 'DELETE', (url: string, body: unknown) => ReturnType<typeof jsonResponse>>> = {},
  catalogue: Product[] = CATALOGUE
) {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'DELETE';
    if (method === 'GET') return Promise.resolve(jsonResponse(200, catalogue));
    const handler = writes[method];
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    return Promise.resolve(handler ? handler(url, body) : jsonResponse(500, { detail: 'unhandled' }));
  });
  vi.stubGlobal('fetch', spy);
  return spy;
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
      <ProductsPage />
    </Provider>
  );
}

const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
const line = (text: string) => (_: string, element: Element | null) => element?.tagName === 'P' && element.textContent === text;
const menuItem = async (user: ReturnType<typeof userEvent.setup>, name: string, item: string) => {
  await user.click(within(rowOf(name)).getByRole('button', { name: `More actions for ${name}` }));
  await user.click(screen.getByRole('menuitem', { name: item }));
};

describe('ProductsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the catalogue with how many customers are on each product', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('Product A')).toBeInTheDocument();
    expect(within(rowOf('Product A')).getByText(line('5 customers'))).toBeInTheDocument();
    expect(within(rowOf('Legacy Suite')).getByText(line('1 customer'))).toBeInTheDocument();
    expect(within(rowOf('Pilot Add-on')).getByText('Nobody on it')).toBeInTheDocument();
  });

  it('puts retired products after the live ones and marks them', async () => {
    mockApi();
    renderPage();

    await screen.findByText('Product A');
    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names[names.length - 1]).toContain('Legacy Suite');
    expect(within(rowOf('Legacy Suite')).getByText('Retired')).toBeInTheDocument();
    expect(
      screen.getByText(/Retired products stay on the customers already recorded/)
    ).toBeInTheDocument();
  });

  it('lets a CSM see the list but not touch it', async () => {
    // Reads are open because the pickers need the list; writes are org
    // configuration. A CSM adding "Prodcut A" would be the free-text problem
    // this table replaced.
    mockApi();
    renderPage('csm');

    expect(await screen.findByText('Product A')).toBeInTheDocument();
    expect(screen.getByText(/You can see the list but not change it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename/ })).not.toBeInTheDocument();
  });

  it('adds a product and shows it in the list', async () => {
    const api = mockApi({
      POST: (_url, body) =>
        jsonResponse(201, product({ id: 9, name: (body as { name: string }).name, customers: 0 })),
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Product A');
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    await user.type(screen.getByLabelText('Name'), '  Product D ');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Product D')).toBeInTheDocument();
    const post = api.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Product D' });
  });

  it('shows the backend saying a name is already taken', async () => {
    mockApi({
      POST: () =>
        jsonResponse(400, {
          name: ['"Product A" already exists: products are unique per organisation, ignoring case.'],
        }),
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Product A');
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    await user.type(screen.getByLabelText('Name'), 'product a');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it('renames a product in place', async () => {
    // The point of products being rows: one edit here renames it on every
    // customer at once.
    const api = mockApi({
      PATCH: (_url, body) => jsonResponse(200, product({ name: (body as { name: string }).name })),
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Product A');
    await user.click(screen.getByRole('button', { name: 'Rename Product A' }));
    const input = screen.getByLabelText('New name for Product A');
    await user.clear(input);
    await user.type(input, 'Product Alpha');
    await user.click(screen.getByRole('button', { name: 'Save name for Product A' }));

    expect(await screen.findByText('Product Alpha')).toBeInTheDocument();
    const patch = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toContain('/products/1/');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ name: 'Product Alpha' });
  });

  it('retires a product rather than deleting one customers are on', async () => {
    const api = mockApi({
      PATCH: () => jsonResponse(200, product({ is_active: false })),
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Product A');
    // Five customers are on it, so there is no Delete to be refused.
    await user.click(within(rowOf('Product A')).getByRole('button', { name: 'More actions for Product A' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Retire']);
    await user.click(screen.getByRole('menuitem', { name: 'Retire' }));

    expect(await within(rowOf('Product A')).findByText('Retired')).toBeInTheDocument();
    const patch = api.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ is_active: false });
  });

  it('brings a retired product back', async () => {
    mockApi({
      PATCH: () => jsonResponse(200, product({ id: 2, name: 'Legacy Suite', is_active: true })),
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Legacy Suite');
    await menuItem(user, 'Legacy Suite', 'Bring back');

    await waitFor(() =>
      expect(within(rowOf('Legacy Suite')).queryByText('Retired')).not.toBeInTheDocument()
    );
  });

  it('deletes a product nobody is on, after confirming', async () => {
    const api = mockApi({ DELETE: () => jsonResponse(204, null) });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Pilot Add-on');
    await menuItem(user, 'Pilot Add-on', 'Delete');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Pilot Add-on')).not.toBeInTheDocument());
    const del = api.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(del?.[0]).toContain('/products/3/');
  });

  it('shows the backend refusal if a delete is rejected anyway', async () => {
    // Somebody was put on it between the page loading and the click.
    mockApi({
      DELETE: () =>
        jsonResponse(400, [
          '1 customer is recorded against "Pilot Add-on". Retire it instead (is_active=false) so their history keeps saying what they bought.',
        ]),
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Pilot Add-on');
    await menuItem(user, 'Pilot Add-on', 'Delete');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText(/Retire it instead/)).toBeInTheDocument();
    expect(screen.getByText('Pilot Add-on')).toBeInTheDocument();
  });

  it('explains an empty catalogue', async () => {
    mockApi({}, []);
    renderPage();

    expect(await screen.findByText(/No products yet/)).toBeInTheDocument();
  });

  it('surfaces a failed load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(500, { detail: 'Server exploded' })))
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Server exploded|Could not load/);
  });
});

describe('Products on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('heads the page from the nav and lists the catalogue as one card of rows, Retired as a neutral badge', async () => {
    mockApi();
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Products' })).toHaveClass('text-[22px]');
    const list = await screen.findByRole('list', { name: 'Products' });
    expect(list).toHaveClass('divide-y');
    expect(within(rowOf('Product A')).getByText('5')).toHaveClass('tabular-nums');
    const retired = within(rowOf('Legacy Suite')).getByText('Retired');
    expect(retired).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(within(rowOf('Legacy Suite')).getByText('Legacy Suite')).not.toHaveClass('line-through');
    expect(screen.getByRole('button', { name: 'Add product' })).not.toHaveClass('bg-accent');
  });

  it('keeps Rename on hover and puts Retire then Delete in the row menu, Delete last in danger', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Pilot Add-on');
    const row = rowOf('Pilot Add-on');
    expect(within(row).getByRole('button', { name: 'Rename Pilot Add-on' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    await user.click(within(row).getByRole('button', { name: 'More actions for Pilot Add-on' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Retire', 'Delete']);
    expect(items[1]).toHaveClass('text-danger-ink');
  });

  it('tells a CSM once, quietly, under the heading', async () => {
    mockApi();
    renderPage('csm');
    await screen.findByText('Product A');
    const note = screen.getByText(/You can see the list but not change it/).closest('[data-part="settings-note"]')!;
    expect(note).not.toHaveClass('bg-warning-dim');
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
  });

  it('does not submit an Add that is aria-disabled', async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Product A');
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    await user.click(add);
    expect(api.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  describe('keyboard focus', () => {
    it('opening the form focuses Name; Cancel and a successful Add return to Add product', async () => {
      mockApi({ POST: (_url, body) => jsonResponse(201, product({ id: 9, name: (body as { name: string }).name, customers: 0 })) });
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Product A');
      await user.click(screen.getByRole('button', { name: 'Add product' }));
      expect(screen.getByLabelText('Name')).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'Add product' })).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await user.type(screen.getByLabelText('Name'), 'Product D');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      await screen.findByText('Product D');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add product' })).toHaveFocus());
    });

    it('renaming focuses the input, and Save, Cancel and Escape return to that row\'s Rename button', async () => {
      mockApi({ PATCH: (_url, body) => jsonResponse(200, product({ name: (body as { name: string }).name })) });
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Product A');
      await user.click(screen.getByRole('button', { name: 'Rename Product A' }));
      expect(screen.getByLabelText('New name for Product A')).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Cancel renaming' }));
      expect(screen.getByRole('button', { name: 'Rename Product A' })).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Rename Product A' }));
      await user.keyboard('{Escape}');
      expect(screen.getByRole('button', { name: 'Rename Product A' })).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Rename Product A' }));
      await user.clear(screen.getByLabelText('New name for Product A'));
      await user.type(screen.getByLabelText('New name for Product A'), 'Product Alpha');
      await user.click(screen.getByRole('button', { name: 'Save name for Product A' }));
      await screen.findByText('Product Alpha');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Product Alpha' })).toHaveFocus());
    });

    it('retiring keeps focus on the row\'s menu even though the row moves', async () => {
      mockApi({ PATCH: () => jsonResponse(200, product({ id: 3, name: 'Pilot Add-on', customers: 0, is_active: false })) });
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Pilot Add-on');
      await menuItem(user, 'Pilot Add-on', 'Retire');
      await within(rowOf('Pilot Add-on')).findByText('Retired');
      await waitFor(() => expect(screen.getByRole('button', { name: 'More actions for Pilot Add-on' })).toHaveFocus());
    });

    it('cancelling a delete returns to the row\'s menu; a delete moves focus to the list, or to Add product when none is left', async () => {
      mockApi({ DELETE: () => jsonResponse(204, null) }, [product({ id: 3, name: 'Pilot Add-on', customers: 0 }), product({ id: 4, name: 'Zed', customers: 0 })]);
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Pilot Add-on');
      await menuItem(user, 'Pilot Add-on', 'Delete');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: 'More actions for Pilot Add-on' })).toHaveFocus();
      await menuItem(user, 'Pilot Add-on', 'Delete');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByText('Pilot Add-on')).toBeNull());
      await waitFor(() => expect(screen.getByRole('list', { name: 'Products' })).toHaveFocus());
      await menuItem(user, 'Zed', 'Delete');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add product' })).toHaveFocus());
    });

    it.each([
      ['Retire', 'Pilot Add-on'],
      ['Bring back', 'Legacy Suite'],
    ])('a failed %s shows the row alert and puts focus on that row\'s menu', async (item, name) => {
      let release: () => void = () => {};
      const spy = mockApi();
      const real = spy.getMockImplementation()!;
      spy.mockImplementation((url, init) =>
        init?.method === 'PATCH' ? new Promise((resolve) => (release = () => resolve(jsonResponse(500, { detail: 'Server error.' })))) : real(url, init),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText(name);
      await menuItem(user, name, item);
      // The menu hands focus back as it closes; take it away, so the test proves the page moves it.
      (document.activeElement as HTMLElement | null)?.blur();
      await act(async () => release());
      expect(await within(rowOf(name)).findByRole('alert')).toHaveTextContent('Server error.');
      await waitFor(() => expect(within(rowOf(name)).getByRole('button', { name: `More actions for ${name}` })).toHaveFocus());
    });

    it('with the Add form open, deleting the last product moves focus to the Catalogue heading', async () => {
      mockApi({ DELETE: () => jsonResponse(204, null) }, [product({ id: 3, name: 'Pilot Add-on', customers: 0 })]);
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Pilot Add-on');
      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await menuItem(user, 'Pilot Add-on', 'Delete');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
      await screen.findByText('No products yet');
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Catalogue' })).toHaveFocus());
    });
  });
});

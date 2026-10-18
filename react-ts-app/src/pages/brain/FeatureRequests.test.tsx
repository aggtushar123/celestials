import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import { capabilitiesForRole } from '../../test/capabilities';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { CARL } from '../../features/brain/testDeskFixtures';
import { CARL_REQUEST_ROWS } from '../../features/brain/testCustomersFixtures';
import { makeRulesStore } from '../rules/testPages';
import { renderBrain } from './testPages';
import { FeatureRequestsPage } from './FeatureRequests';
import { jsonResponse, requestFull, requestRow } from '../../test/requestsFixtures';

/** A sibling that jumps the URL's `?scope=` without going through any
 *  in-page control — the shape of a browser back/forward while a detail
 *  pane (which renders no ScopeSwitch of its own) is open. */
function Nudge({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      jump
    </button>
  );
}

function renderWithNudge(url: string, to: string) {
  return render(
    <Provider store={makeRulesStore('admin')}>
      <MemoryRouter initialEntries={[url]}>
        <Nudge to={to} />
        <FeatureRequestsPage />
      </MemoryRouter>
    </Provider>,
  );
}

// Integration tier: the real page against the fetch boundary. The Brain's
// scope reads go to the contract stub (customers spec §2.2); every other
// call passes through to `fetchMock`.

const fetchMock = vi.fn();

function makeStore(role: 'admin' | 'csm' = 'admin') {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1, email: 'alice@acme.io', name: 'Alice', avatar: '', role, role_id: 1,
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
  });
}

function renderPage(role: 'admin' | 'csm' = 'admin') {
  stubBrain(role === 'admin' ? { passThrough: fetchMock } : { passThrough: fetchMock, offered: ['me'], viewAll: false });
  return render(
    <Provider store={makeStore(role)}>
      <MemoryRouter>
        <FeatureRequestsPage />
      </MemoryRouter>
    </Provider>
  );
}

describe('FeatureRequestsPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ranks requests by the revenue behind them', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [
      requestRow(),
      requestRow({ id: 5, title: 'CSV export', arr: '45000', companies: 1, interactions: 1, last_90_days: 1, previous_90_days: 0 }),
    ]));
    renderPage();
    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]).getByText('Slack alerts')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$200.0K')).toBeInTheDocument();
    // Figured sets every figure in its own <span>, so "2 companies" spans a
    // span and a text node: RTL's getByText only sees an element's *direct*
    // text-node children, so it can't find the phrase as one match even
    // though it is there. toHaveTextContent reads the full textContent
    // instead, following the pattern already established by
    // CustomerLists.test.tsx and Customers.test.tsx.
    expect(rows[0]).toHaveTextContent('2 companies');
    expect(within(rows[1]).getByText('CSV export')).toBeInTheDocument();
  });

  it('labels who owns a request, rather than a bare name', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [requestRow({ owner: { id: 9, name: 'Priya Rao' } })]));
    renderPage();
    expect(await screen.findByText('Owner: Priya Rao')).toBeInTheDocument();
  });

  it('filters by status', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow({ id: 5, title: 'CSV export', status: 'planned' })]));
    renderPage();
    await screen.findByText('Slack alerts');
    await userEvent.click(screen.getByRole('button', { name: 'Planned' }));
    expect(await screen.findByText('CSV export')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/requests\/\?status=planned&scope=company$/);
  });

  it('filters by status with toggle chips and shows each status as a badge, never a black pill', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [requestRow()]));
    renderPage();
    const chips = await screen.findByRole('group', { name: 'Status' });
    const all = within(chips).getByRole('button', { name: 'All' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(all.className).not.toMatch(/(?<![\w-])bg-accent(?![\w-])|text-on-accent/);
    const list = await screen.findByRole('list', { name: 'Feature requests' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(within(list).getAllByText(/^(Open|Planned|Shipped|Declined)$/)[0]).toHaveClass('rounded-full', 'text-[11px]');
  });

  it('opens one and shows the companies asking and the evidence', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]))
      .mockResolvedValueOnce(jsonResponse(200, requestFull()));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Slack alerts' }));
    expect(await screen.findByText('Push health alerts into a shared Slack channel.')).toBeInTheDocument();
    const companies = screen.getByRole('list', { name: 'Companies asking' });
    expect(within(companies).getAllByRole('listitem')).toHaveLength(2);
    expect(within(companies).getByRole('link', { name: /Pizza Hut/ })).toHaveAttribute('href', '/organizations/12');
    const evidence = screen.getByRole('list', { name: 'Evidence' });
    expect(within(evidence).getByText('Can we get alerts in Slack?')).toBeInTheDocument();
    expect(within(evidence).getByText('Slack notifications please')).toBeInTheDocument();
  });

  it('gathers and reports what it filed', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(200, { created: 2, linked: 5, remaining: 0 }))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]));
    renderPage();
    await screen.findByText('No asks from customers yet.');
    // One live region, mounted (sr-only) before there is anything to say.
    const region = document.querySelector('[data-part="gather-status"]') as HTMLElement;
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveClass('sr-only');
    await userEvent.click(screen.getByRole('button', { name: 'Gather asks' }));
    await waitFor(() => expect(region).toHaveTextContent('2 new requests from 5 asks'));
    expect(document.querySelector('[data-part="gather-status"]')).toBe(region);
    expect(region).not.toHaveClass('sr-only');
    expect(await screen.findByText('Slack alerts')).toBeInTheDocument();
  });

  it('says what a stopped gather still filed, and shows it', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(429, { created: 1, linked: 2, remaining: 3, detail: 'This organisation has spent its monthly model budget.' }))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]));
    renderPage();
    await screen.findByText('No asks from customers yet.');
    await userEvent.click(screen.getByRole('button', { name: 'Gather asks' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 new request from 2 asks was still filed/);
    expect(await screen.findByText('Slack alerts')).toBeInTheDocument();
  });

  it('changes a status from the detail pane', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]))
      .mockResolvedValueOnce(jsonResponse(200, requestFull()))
      .mockResolvedValueOnce(jsonResponse(200, requestFull({ status: 'planned' })))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow({ status: 'planned' })]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Slack alerts' }));
    await screen.findByRole('list', { name: 'Evidence' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'planned');
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PATCH');
    expect(JSON.parse((patch?.[1] as RequestInit).body as string)).toEqual({ status: 'planned' });
    expect(await screen.findByText('Planned')).toBeInTheDocument();
  });

  it('hides gathering and curating from a CSM but still shows the list', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, [requestRow()]));
    renderPage('csm');
    await screen.findByText('Slack alerts');
    expect(screen.queryByRole('button', { name: 'Gather asks' })).not.toBeInTheDocument();
    expect(screen.getByText(/only the companies you can open/i)).toBeInTheDocument();
  });

  it('shows the error with a retry', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { detail: 'Boom' }))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Slack alerts')).toBeInTheDocument();
  });

  it('shows a 400 error from the list with Retry', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { detail: 'Bad request.' }))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad request.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Slack alerts')).toBeInTheDocument();
  });

  it('keeps the scoped figures when a status change answers with the unscoped detail', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [requestRow()]))
      .mockResolvedValueOnce(jsonResponse(200, requestFull()))
      .mockResolvedValueOnce(jsonResponse(200, requestFull({ status: 'planned', arr: '900000' })))
      .mockResolvedValueOnce(jsonResponse(200, [requestRow({ status: 'planned' })]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Slack alerts' }));
    await screen.findByRole('list', { name: 'Evidence' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'planned');
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('planned'));
    // Compact money, the full figure on hover.
    expect(screen.getByText('$200.0K')).toHaveAttribute('title', '$200,000.00');
    expect(screen.queryByText('$900.0K')).toBeNull();
  });
});

describe('Feature Requests in a scope (customers spec §2.2)', () => {
  const where = () => screen.getByTestId('where').textContent;
  afterEach(() => vi.unstubAllGlobals());

  it('reads the scope in the URL, and reads again on a switch', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    expect(await screen.findByText('SSO with Okta')).toBeInTheDocument();
    expect(screen.queryByText('CSV export')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(await screen.findByText('CSV export')).toBeInTheDocument();
    expect(requests(spy, 'GET', '/requests/')).toEqual(['/requests/?scope=team', '/requests/?scope=company']);
  });

  it('drops to the skeleton, not the last view’s rows, while a switch is in flight', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    await screen.findByText('SSO with Okta');
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passOn = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/requests/') && url.searchParams.get('scope') === 'company') await held;
        return passOn(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByText('Loading feature requests')).toBeInTheDocument();
    expect(screen.queryByText('SSO with Okta')).toBeNull();
    release();
    expect(await screen.findByText('CSV export')).toBeInTheDocument();
  });

  it('opens to a member without view_all_accounts, on their own book, with no curation', async () => {
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, requestRows: { me: CARL_REQUEST_ROWS } });
    renderBrain('/brain/requests', { role: 'csm', user: CARL });
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=me'));
    expect(await screen.findByText('$120.0K')).toBeInTheDocument();
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gather asks' })).toBeNull();
    expect(requests(spy, 'GET', '/requests/')).toEqual(['/requests/?scope=me']);
  });

  it('opens a request in the same scope', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    await userEvent.click(await screen.findByRole('button', { name: 'Open SSO with Okta' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'SSO with Okta' })).toBeInTheDocument();
    expect(requests(spy, 'GET', '/requests/2/')).toEqual(['/requests/2/?scope=team']);
  });

  it('sits in the Brain frame: back to Customers in the same scope, a 15px title, the switch in the bar', async () => {
    stubBrain();
    renderBrain('/brain/requests?scope=team');
    // The tab of the same name sits in the bar's nav; the way back is outside it.
    const back = await waitFor(() => {
      const link = screen.getAllByRole('link', { name: 'Customers' }).find((l) => !l.closest('nav'));
      if (!link) throw new Error('no way back yet');
      return link;
    });
    await waitFor(() => expect(back).toHaveAttribute('href', '/brain/customers?scope=team'));
    expect(screen.getByRole('heading', { level: 2, name: 'Feature Requests' })).toHaveClass('text-[15px]', 'font-semibold');
    // The only h1 is the Brain bar's (BrainAskLayout's PageHeader); the page draws none.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
    expect(document.querySelector('.font-display')).toBeNull();
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  it('drops back to the default view with the notice on a 403', async () => {
    const { revoke } = stubBrain();
    renderBrain('/brain/requests?scope=team');
    revoke('team');
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain/requests?scope=company'));
  });

  it('words an empty view by its own scope, not a flat "no feature requests yet" (final review minor #5)', async () => {
    stubBrain();
    renderBrain('/brain/requests?scope=me');
    expect(await screen.findByText('No asks from your customers yet.')).toBeInTheDocument();
    expect(screen.queryByText('No feature requests yet.')).toBeNull();
  });

  it('shows a failed scopes read with Retry', async () => {
    stubBrain({ failScopes: 1 });
    renderBrain('/brain/requests');
    expect(await screen.findByText(SAY.LOAD_SCOPES)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('SSO with Okta')).toBeInTheDocument();
  });

  it('clears an open request when the scope changes under it, rather than keep the old scope’s detail on screen (final review minor #7)', async () => {
    const { spy } = stubBrain();
    renderWithNudge('/brain/requests?scope=team', '/brain/requests?scope=company');
    await userEvent.click(await screen.findByRole('button', { name: 'Open SSO with Okta' }));
    await screen.findByRole('list', { name: 'Evidence' });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passOn = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/requests/2/') && url.searchParams.get('scope') === 'company') await held;
        return passOn(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'jump' }));
    expect(screen.getByText('Loading request')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Evidence' })).toBeNull();
    release();
    expect(await screen.findByRole('list', { name: 'Evidence' })).toBeInTheDocument();
  });
});

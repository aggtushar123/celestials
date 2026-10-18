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
import { makeRulesStore } from '../rules/testPages';
import { renderBrain } from './testPages';
import { AnomaliesPage } from './Anomalies';
import type { AnomalyDetail, AnomalyRow } from '../../features/anomalies/anomaliesApi';

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
        <AnomaliesPage />
      </MemoryRouter>
    </Provider>,
  );
}

// Integration tier: the real page against the fetch boundary. The Brain's
// scope reads go to the contract stub (customers spec §2.2); every other
// call passes through to `fetchMock`.

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function row(overrides: Partial<AnomalyRow> = {}): AnomalyRow {
  return {
    id: 3,
    title: 'SSO login failures',
    summary: 'Six accounts cannot get past the identity provider since Tuesday.',
    status: 'live',
    arr: '300000',
    companies: 6,
    interactions: 11,
    first_seen_at: '2026-09-20T09:00:00Z',
    last_seen_at: '2026-09-23T09:00:00Z',
    acknowledged_by: null,
    ...overrides,
  };
}

function detail(overrides: Partial<AnomalyDetail> = {}): AnomalyDetail {
  return {
    ...row(),
    companies_hit: [
      { id: 12, name: 'Pizza Hut', arr: '120000' },
      { id: 13, name: 'Burger King', arr: '80000' },
    ],
    evidence: [
      { id: 1, kind: 'ticket', record_id: 9, snippet: 'SSO login fails after the update', occurred_at: '2026-09-22T09:00:00Z', company: { type: 'customer', id: 12, name: 'Pizza Hut' } },
      { id: 2, kind: 'email', record_id: 4, snippet: 'Nobody can sign in this morning', occurred_at: '2026-09-21T09:00:00Z', company: { type: 'customer', id: 13, name: 'Burger King' } },
    ],
    ...overrides,
  };
}

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
  render(
    <Provider store={makeStore(role)}>
      <MemoryRouter>
        <AnomaliesPage />
      </MemoryRouter>
    </Provider>
  );
}

describe('AnomaliesPage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ranks clusters by the revenue behind them', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [row(), row({ id: 4, title: 'Billing double charges', arr: '45000', companies: 3, interactions: 4 })]));
    renderPage();
    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]).getByText('SSO login failures')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$300.0K')).toBeInTheDocument();
    // Figured sets every figure in its own <span>, so "6 companies" spans a
    // span and a text node: RTL's getByText only sees an element's *direct*
    // text-node children, so it can't find the phrase as one match even
    // though it is there. toHaveTextContent reads the full textContent
    // instead, following the pattern already established by
    // CustomerLists.test.tsx and Customers.test.tsx.
    expect(rows[0]).toHaveTextContent('6 companies');
    expect(within(rows[1]).getByText('Billing double charges')).toBeInTheDocument();
  });

  it('labels when it was seen and who acknowledged it, rather than bare values', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [row({ acknowledged_by: { id: 9, name: 'Priya Rao' } })]));
    renderPage();
    await screen.findByText('SSO login failures');
    // "Seen 20 Sep to 23 Sep" spans Figured's spans and text nodes (see
    // above), so it is checked via the row's full textContent.
    expect(document.querySelector('[data-row="3"]')).toHaveTextContent('Seen 20 Sep to 23 Sep');
    expect(screen.getByText('Acknowledged by Priya Rao')).toBeInTheDocument();
  });

  it('filters by status', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [row()]))
      .mockResolvedValueOnce(jsonResponse(200, [row({ id: 4, title: 'Billing double charges', status: 'resolved' })]));
    renderPage();
    await screen.findByText('SSO login failures');
    await userEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    expect(await screen.findByText('Billing double charges')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/anomalies\/\?status=resolved&scope=company$/);
  });

  it('filters by status with toggle chips; a live cluster carries the one red badge', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [row()]));
    renderPage();
    const chips = await screen.findByRole('group', { name: 'Status' });
    expect(within(chips).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    const list = await screen.findByRole('list', { name: 'Anomalies' });
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(within(list).getAllByText('Live')[0]).toHaveClass('bg-danger-dim', 'text-danger-ink');
  });

  it('opens one and shows the companies hit and the reports', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [row()]))
      .mockResolvedValueOnce(jsonResponse(200, detail()));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open SSO login failures' }));
    expect(await screen.findByText(/cannot get past the identity provider/)).toBeInTheDocument();
    const hit = screen.getByRole('list', { name: 'Companies hit' });
    expect(within(hit).getByRole('link', { name: /Pizza Hut/ })).toHaveAttribute('href', '/organizations/12');
    const reports = screen.getByRole('list', { name: 'Reports' });
    expect(within(reports).getByText('SSO login fails after the update')).toBeInTheDocument();
  });

  it('acknowledges one from the detail pane', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [row()]))
      .mockResolvedValueOnce(jsonResponse(200, detail()))
      .mockResolvedValueOnce(jsonResponse(200, detail({ status: 'acknowledged' })))
      .mockResolvedValueOnce(jsonResponse(200, [row({ status: 'acknowledged' })]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open SSO login failures' }));
    await screen.findByRole('list', { name: 'Reports' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'acknowledged');
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PATCH');
    expect(JSON.parse((patch?.[1] as RequestInit).body as string)).toEqual({ status: 'acknowledged' });
    expect(await screen.findByText('Acknowledged')).toBeInTheDocument();
  });

  it('looks now and says what it found', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(200, { found: 2, attached: 5 }))
      .mockResolvedValueOnce(jsonResponse(200, [row()]));
    renderPage();
    await screen.findByText(/Nothing unusual/);
    // One live region, mounted (sr-only) before there is anything to say.
    const region = document.querySelector('[data-part="look-status"]') as HTMLElement;
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveClass('sr-only');
    await userEvent.click(screen.getByRole('button', { name: 'Look now' }));
    await waitFor(() => expect(region).toHaveTextContent('2 new clusters, 5 reports attached'));
    expect(document.querySelector('[data-part="look-status"]')).toBe(region);
    expect(region).not.toHaveClass('sr-only');
    expect(await screen.findByText('SSO login failures')).toBeInTheDocument();
  });

  it('reports a stopped run as an error, keeping what it found', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(429, { found: 1, attached: 0, detail: 'This organisation has spent its monthly model budget.' }))
      .mockResolvedValueOnce(jsonResponse(200, [row()]));
    renderPage();
    await screen.findByText(/Nothing unusual/);
    await userEvent.click(screen.getByRole('button', { name: 'Look now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 new cluster was still found/);
  });

  it('hides looking and setting a status from a CSM', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [row()]));
    renderPage('csm');
    await screen.findByText('SSO login failures');
    expect(screen.queryByRole('button', { name: 'Look now' })).not.toBeInTheDocument();
    expect(screen.getByText(/only the companies you can open/i)).toBeInTheDocument();
  });

  it('shows the error with a retry', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { detail: 'Boom' }))
      .mockResolvedValueOnce(jsonResponse(200, [row()]));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('SSO login failures')).toBeInTheDocument();
  });

  it('shows a 400 error from the list with Retry', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { detail: 'Bad request.' }))
      .mockResolvedValueOnce(jsonResponse(200, [row()]));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad request.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('SSO login failures')).toBeInTheDocument();
  });

  it('keeps the scoped figures when a status change answers with the unscoped detail (mirrors FeatureRequests)', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, [row()]))
      .mockResolvedValueOnce(jsonResponse(200, detail()))
      .mockResolvedValueOnce(jsonResponse(200, detail({ status: 'acknowledged', arr: '900000' })))
      .mockResolvedValueOnce(jsonResponse(200, [row({ status: 'acknowledged' })]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Open SSO login failures' }));
    await screen.findByRole('list', { name: 'Reports' });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'acknowledged');
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('acknowledged'));
    // Compact money, the full figure on hover.
    expect(screen.getByText('$300.0K')).toHaveAttribute('title', '$300,000.00');
    expect(screen.queryByText('$900.0K')).toBeNull();
  });
});

describe('Anomalies in a scope (customers spec §2.2)', () => {
  const where = () => screen.getByTestId('where').textContent;
  afterEach(() => vi.unstubAllGlobals());

  it('reads the scope in the URL with the title the server gated, and reads again on a switch', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/anomalies?scope=team');
    expect(await screen.findByText('Similar reports across 2 of your companies')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(await screen.findByText('SSO login failures')).toBeInTheDocument();
    expect(requests(spy, 'GET', '/anomalies/')).toEqual(['/anomalies/?scope=team', '/anomalies/?scope=company']);
  });

  it('sits in the Brain frame: back to Customers in the same scope, a 15px title, the switch in the bar', async () => {
    stubBrain();
    renderBrain('/brain/anomalies?scope=team');
    // The tab of the same name sits in the bar's nav; the way back is outside it.
    const back = await waitFor(() => {
      const link = screen.getAllByRole('link', { name: 'Customers' }).find((l) => !l.closest('nav'));
      if (!link) throw new Error('no way back yet');
      return link;
    });
    await waitFor(() => expect(back).toHaveAttribute('href', '/brain/customers?scope=team'));
    expect(screen.getByRole('heading', { level: 2, name: 'Anomalies' })).toHaveClass('text-[15px]', 'font-semibold');
    // The only h1 is the Brain bar's (BrainAskLayout's PageHeader); the page draws none.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Brain']);
    expect(document.querySelector('.font-display')).toBeNull();
    expect(document.querySelector('[data-brain-frame]')).not.toBeNull();
    expect(within(screen.getByTestId('nav-actions')).getByRole('group', { name: 'View' })).toBeInTheDocument();
  });

  it('opens to a member without view_all_accounts, with no Look now', async () => {
    stubBrain({ reader: CARL, offered: ['me'], viewAll: false });
    renderBrain('/brain/anomalies', { role: 'csm', user: CARL });
    await waitFor(() => expect(where()).toBe('/brain/anomalies?scope=me'));
    expect(await screen.findByText(/Nothing unusual/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Look now' })).toBeNull();
  });

  it('drops back to the default view with the notice on a 403', async () => {
    const { revoke } = stubBrain();
    renderBrain('/brain/anomalies?scope=team');
    revoke('team');
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain/anomalies?scope=company'));
  });

  it('drops to the skeleton, not the last view’s rows, while a switch is in flight (mirrors FeatureRequests)', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/anomalies?scope=team');
    await screen.findByText('Similar reports across 2 of your companies');
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passOn = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/anomalies/') && url.searchParams.get('scope') === 'company') await held;
        return passOn(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(screen.getByText('Loading anomalies')).toBeInTheDocument();
    expect(screen.queryByText('Similar reports across 2 of your companies')).toBeNull();
    release();
    expect(await screen.findByText('SSO login failures')).toBeInTheDocument();
  });

  it('shows a failed scopes read with Retry', async () => {
    stubBrain({ failScopes: 1 });
    renderBrain('/brain/anomalies');
    expect(await screen.findByText(SAY.LOAD_SCOPES)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('SSO login failures')).toBeInTheDocument();
  });

  it('clears an open cluster when the scope changes under it, rather than keep the old scope’s detail on screen (final review #7/#8)', async () => {
    const { spy } = stubBrain();
    renderWithNudge('/brain/anomalies?scope=team', '/brain/anomalies?scope=company');
    await userEvent.click(await screen.findByRole('button', { name: 'Open Similar reports across 2 of your companies' }));
    await screen.findByRole('list', { name: 'Reports' });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const passOn = spy.getMockImplementation()!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/anomalies/4/') && url.searchParams.get('scope') === 'company') await held;
        return passOn(input, init);
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'jump' }));
    expect(screen.getByText('Loading the cluster')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Reports' })).toBeNull();
    release();
    expect(await screen.findByRole('list', { name: 'Reports' })).toBeInTheDocument();
  });
});

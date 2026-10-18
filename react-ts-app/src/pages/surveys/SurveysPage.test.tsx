import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route, useLocation, useParams } from 'react-router-dom';
import customersReducer from '../../features/customers/customersSlice';
import authReducer from '../../features/auth/authSlice';
import { SurveysPage } from './SurveysPage';
import { ALL_CAPABILITIES } from '../../test/capabilities';

// Integration tier (see the `testing` skill): real store, network mocked
// at the fetch boundary — responses shaped exactly like revenact-backend's
// real SurveySerializer payloads (see docs/API_CONTRACTS.md -> customers
// -> Survey).
const sentNps = {
  id: 1,
  survey_type: 'nps',
  survey_type_display: 'NPS',
  status: 'sent',
  status_display: 'Sent',
  score: null,
  sent_at: '2026-08-01',
  responded_at: null,
  companies: [{ id: 6, name: 'Shopify' }],
  account_id: null,
  account_name: null,
  created_at: '2026-08-01T00:00:00Z',
};

const respondedCsat = {
  id: 2,
  survey_type: 'csat',
  survey_type_display: 'CSAT',
  status: 'responded',
  status_display: 'Responded',
  score: 85,
  sent_at: '2026-08-05',
  responded_at: '2026-08-07',
  companies: [{ id: 8, name: 'WeWork' }],
  account_id: null,
  account_name: null,
  created_at: '2026-08-05T00:00:00Z',
};

const EMPTY_CUSTOMERS_PAGE = { count: 0, next: null, previous: null, results: [] };

// A stand-in for OrganizationDetails — asserting the real Details page
// rendered here would drag in the whole ActivityFeed tree; this only needs
// to prove *which* route SurveysPage's row-click landed on and with what
// nav state, same as any other "does the link work" check.
function DetailsStub() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <div>
      Organization {id} — {location.search || 'no filter'}
    </div>
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderPage(url = '/surveys') {
  const store = configureStore({
    reducer: { customers: customersReducer, auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role: 'admin' as const,
          role_id: 1,
          role_name: 'Admin',
          permissions: ALL_CAPABILITIES,
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
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/surveys"
            element={
              <>
                <SurveysPage />
                <Where />
              </>
            }
          />
          <Route path="/organizations/:id" element={<DetailsStub />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeFetchMock({
  surveys,
  customersPage = EMPTY_CUSTOMERS_PAGE,
}: {
  surveys: unknown[];
  customersPage?: unknown;
}) {
  return vi.fn((url: string, options?: { method?: string; body?: string }) => {
    const method = options?.method ?? 'GET';
    if (method === 'GET' && url.includes('/customers/') && !url.includes('/surveys/')) {
      return Promise.resolve(jsonResponse(200, customersPage));
    }
    if (method === 'GET' && url.endsWith('/surveys/')) {
      return Promise.resolve(jsonResponse(200, surveys));
    }
    return Promise.resolve(jsonResponse(200, []));
  });
}

describe('SurveysPage (/surveys)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the real, unpaginated endpoint on mount and renders the rollup cards + table', async () => {
    const fetchMock = makeFetchMock({ surveys: [sentNps, respondedCsat] });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText('Shopify')).toBeInTheDocument();
    expect(screen.getByText('WeWork')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/surveys/'), expect.anything());

    // NPS card: 1 sent, no responses yet.
    expect(screen.getByText('No responses yet')).toBeInTheDocument();
    // CSAT card: 1 sent, 1 responded (100%), avg score 85.
    expect(screen.getByRole('button', { name: 'CSAT: 1 sent' })).toHaveTextContent('100% responded · avg 85');
  });

  it('clicking a rollup card filters the table to that survey type', async () => {
    const fetchMock = makeFetchMock({ surveys: [sentNps, respondedCsat] });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Shopify');

    await user.click(screen.getByRole('button', { name: /^NPS/ }));

    expect(screen.getByText('Shopify')).toBeInTheDocument();
    expect(screen.queryByText('WeWork')).not.toBeInTheDocument();
    expect(screen.getByText('Clear filter')).toBeInTheDocument();

    await user.click(screen.getByText('Clear filter'));
    expect(screen.getByText('WeWork')).toBeInTheDocument();
  });

  it('shows the backend error instead of crashing', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/surveys/')) {
        return Promise.resolve(jsonResponse(500, { detail: 'Server error.' }));
      }
      return Promise.resolve(jsonResponse(200, EMPTY_CUSTOMERS_PAGE));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText('Server error.')).toBeInTheDocument();
  });

  it('logging a survey posts to /surveys/ with customer_id and shows it in the table', async () => {
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      const method = options?.method ?? 'GET';
      if (method === 'GET' && url.includes('/customers/') && !url.includes('/surveys/') && !url.includes('/accounts/')) {
        return Promise.resolve(
          jsonResponse(200, { count: 1, next: null, previous: null, results: [{ id: 6, name: 'Shopify' }] })
        );
      }
      if (method === 'GET' && url.endsWith('/customers/6/accounts/')) {
        return Promise.resolve(jsonResponse(200, []));
      }
      if (method === 'POST' && url.endsWith('/surveys/')) {
        const body = JSON.parse(options!.body!);
        expect(body.customer_id).toBe(6);
        expect(body.survey_type).toBe('nps');
        return Promise.resolve(
          jsonResponse(201, {
            ...sentNps,
            id: 99,
            companies: [{ id: 6, name: 'Shopify' }],
          })
        );
      }
      if (method === 'GET' && url.endsWith('/surveys/')) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('No surveys logged yet.');

    await user.click(screen.getByRole('button', { name: 'Log survey' }));
    await user.selectOptions(screen.getByLabelText('Company *'), '6');
    const submitButton = screen
      .getAllByRole('button', { name: 'Log Survey' })
      .find((btn) => btn.closest('form'))!;
    await user.click(submitButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/surveys/'),
        expect.objectContaining({ method: 'POST' })
      )
    );
    expect(await within(await screen.findByRole('list', { name: 'Logged surveys' })).findByText('Shopify')).toBeInTheDocument();
  });

  it('clicking a row navigates to its Customer\'s Details page with the Surveys filter active', async () => {
    const fetchMock = makeFetchMock({ surveys: [sentNps] });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('link', { name: 'Shopify' }));

    expect(await screen.findByText('Organization 6 — ?group=feedback')).toBeInTheDocument();
  });

  it('editing a survey from the Actions column PATCHes it and updates the row, without navigating', async () => {
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      const method = options?.method ?? 'GET';
      if (method === 'GET' && url.includes('/customers/') && !url.includes('/surveys/')) {
        return Promise.resolve(jsonResponse(200, EMPTY_CUSTOMERS_PAGE));
      }
      if (method === 'PATCH' && url.endsWith('/surveys/1/')) {
        const body = JSON.parse(options!.body!);
        expect(body.survey_type).toBe('nps');
        expect(body.sent_at).toBe('2026-08-10');
        return Promise.resolve(jsonResponse(200, { ...sentNps, sent_at: '2026-08-10' }));
      }
      if (method === 'GET' && url.endsWith('/surveys/')) {
        return Promise.resolve(jsonResponse(200, [sentNps]));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Shopify');

    await user.click(screen.getByRole('button', { name: 'Edit: Shopify' }));
    expect(screen.getByText('Edit NPS Survey')).toBeInTheDocument();

    const sentInput = screen.getByDisplayValue('2026-08-01');
    await user.clear(sentInput);
    await user.type(sentInput, '2026-08-10');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/surveys/1/'),
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    // Didn't fall through to the row-click navigation.
    expect(screen.queryByText(/Organization \d+/)).not.toBeInTheDocument();
    expect(screen.getByText('10 Aug 2026')).toBeInTheDocument();
  });

  it('marking a sent survey Expired PATCHes its status without a confirm step', async () => {
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      const method = options?.method ?? 'GET';
      if (method === 'GET' && url.includes('/customers/') && !url.includes('/surveys/')) {
        return Promise.resolve(jsonResponse(200, EMPTY_CUSTOMERS_PAGE));
      }
      if (method === 'PATCH' && url.endsWith('/surveys/1/')) {
        const body = JSON.parse(options!.body!);
        expect(body).toEqual({ status: 'expired' });
        return Promise.resolve(
          jsonResponse(200, { ...sentNps, status: 'expired', status_display: 'Expired' })
        );
      }
      if (method === 'GET' && url.endsWith('/surveys/')) {
        return Promise.resolve(jsonResponse(200, [sentNps]));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Shopify');

    await user.click(screen.getByRole('button', { name: 'Mark expired: Shopify' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/surveys/1/'),
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    expect(await screen.findByText('Expired')).toBeInTheDocument();
  });

  it('deleting a survey via the Actions column\'s confirm dialog DELETEs it and removes the row', async () => {
    const fetchMock = vi.fn((url: string, options?: { method?: string }) => {
      const method = options?.method ?? 'GET';
      if (method === 'GET' && url.includes('/customers/') && !url.includes('/surveys/')) {
        return Promise.resolve(jsonResponse(200, EMPTY_CUSTOMERS_PAGE));
      }
      if (method === 'DELETE' && url.endsWith('/surveys/1/')) {
        return Promise.resolve({ ok: true, status: 204, json: async () => null });
      }
      if (method === 'GET' && url.endsWith('/surveys/')) {
        return Promise.resolve(jsonResponse(200, [sentNps]));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Shopify');

    await user.click(screen.getByRole('button', { name: 'Delete: Shopify' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/surveys/1/'),
        expect.objectContaining({ method: 'DELETE' })
      )
    );
    expect(screen.queryByText('Shopify')).not.toBeInTheDocument();
    expect(await screen.findByText('No surveys logged yet.')).toBeInTheDocument();
  });

  it('renders a placeholder when there are no responses yet, and the trend chart otherwise', async () => {
    const fetchMock = makeFetchMock({ surveys: [sentNps] });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByText('Shopify');

    expect(screen.getByRole('heading', { name: 'Score trend' })).toBeInTheDocument();
    expect(screen.getByText('Not enough responses yet.')).toBeInTheDocument();
  });

  it('shows the trend chart (no placeholder) once there are responded surveys', async () => {
    const anotherMonthCsat = { ...respondedCsat, id: 3, responded_at: '2026-09-01' };
    const fetchMock = makeFetchMock({ surveys: [respondedCsat, anotherMonthCsat] });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findAllByText('WeWork');

    expect(screen.getByRole('heading', { name: 'Score trend' })).toBeInTheDocument();
    expect(screen.queryByText('Not enough responses yet.')).not.toBeInTheDocument();
  });

  it('filters to one organization from ?customer=, and the picker keeps its choice in the URL', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/surveys/?customer=6')) return Promise.resolve(jsonResponse(200, [sentNps]));
      if (url.endsWith('/surveys/')) return Promise.resolve(jsonResponse(200, [sentNps, respondedCsat]));
      if (url.includes('/customers/')) {
        return Promise.resolve(
          jsonResponse(200, { count: 2, next: null, previous: null, results: [{ id: 6, name: 'Shopify' }, { id: 8, name: 'WeWork' }] }),
        );
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage('/surveys?customer=6');

    const list = await screen.findByRole('list', { name: 'Logged surveys' });
    expect(await within(list).findByText('Shopify')).toBeInTheDocument();
    expect(within(list).queryByText('WeWork')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Organization')).toHaveValue('6');
    expect(await screen.findByText('Every NPS, CSAT and CES survey logged for Shopify and its accounts.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Organization'), '');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/surveys\?tab=logged$/);
    expect(await within(screen.getByRole('list', { name: 'Logged surveys' })).findByText('WeWork')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Organization'), '8');
    expect(screen.getByTestId('where')).toHaveTextContent('/surveys?tab=logged&customer=8');
  });

  it('shows an organization it cannot name as its own option, with an empty list rather than an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(jsonResponse(200, url.includes('/surveys/') ? [] : EMPTY_CUSTOMERS_PAGE)),
      ),
    );
    renderPage('/surveys?customer=999');
    expect(await screen.findByText('No surveys logged for Organization 999 yet.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Organization 999' })).toBeInTheDocument();
  });

  it('ignores a malformed ?customer= and reads every survey', async () => {
    const fetchMock = makeFetchMock({ surveys: [sentNps] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage('/surveys?customer=abc');
    expect(await screen.findByText('Shopify')).toBeInTheDocument();
    expect(screen.getByLabelText('Organization')).toHaveValue('');
  });

  it("shows the rollups loading, not the previous filter's numbers, while a new filter loads", async () => {
    let answer: (body: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/surveys/?customer=8')) return new Promise((resolve) => (answer = (body) => resolve(jsonResponse(200, body))));
        if (url.endsWith('/surveys/')) return Promise.resolve(jsonResponse(200, [sentNps, respondedCsat]));
        if (url.includes('/customers/')) {
          return Promise.resolve(
            jsonResponse(200, { count: 2, next: null, previous: null, results: [{ id: 6, name: 'Shopify' }, { id: 8, name: 'WeWork' }] }),
          );
        }
        return Promise.resolve(jsonResponse(200, []));
      }),
    );
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('button', { name: 'CSAT: 1 sent' })).toHaveTextContent('100% responded · avg 85');
    await user.selectOptions(screen.getByLabelText('Organization'), '8');
    expect(screen.queryByRole('button', { name: 'CSAT: 1 sent' })).not.toBeInTheDocument();
    expect(screen.queryByText('No responses yet')).not.toBeInTheDocument();
    expect(screen.getByText('Loading the survey rollups')).toBeInTheDocument();
    answer([respondedCsat]);
    expect(await screen.findByRole('button', { name: 'CSAT: 1 sent' })).toHaveTextContent('100% responded · avg 85');
    expect(screen.queryByText('Loading the survey rollups')).not.toBeInTheDocument();
  });

  it('keeps a score a sent survey wrote read-only: no Mark Expired, Edit or Delete, a link to its send instead', async () => {
    const fromSend = { ...sentNps, id: 3, send_id: 12, companies: [{ id: 7, name: 'Pizza Hut' }] };
    vi.stubGlobal('fetch', makeFetchMock({ surveys: [respondedCsat, fromSend] }));
    renderPage();
    const link = await screen.findByRole('link', { name: 'From a sent survey' });
    expect(link).toHaveAttribute('href', '/surveys/12');
    const row = link.closest('li') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /^Mark expired/ })).toBeNull();
    expect(within(row).queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(within(row).queryByRole('button', { name: /^Delete/ })).toBeNull();
    const byHand = screen.getAllByRole('listitem').find((candidate) => candidate.textContent?.includes('WeWork')) as HTMLElement;
    expect(within(byHand).getByRole('button', { name: 'Edit: WeWork' })).toBeInTheDocument();
    expect(within(byHand).getByRole('button', { name: 'Delete: WeWork' })).toBeInTheDocument();
  });
});

describe('Logged scores on the primitives (Impact PR)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('is one toolbar: the organisation filter, the count, and Log survey last as the one primary', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ surveys: [sentNps, respondedCsat] }));
    renderPage();
    expect(await screen.findByLabelText('Organization')).toHaveClass('appearance-none');
    expect(screen.getByRole('button', { name: 'Log survey' })).toHaveClass('bg-accent');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 surveys'));
  });

  it('draws NPS, CSAT and CES as filter tiles of one anatomy', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ surveys: [sentNps, respondedCsat] }));
    renderPage();
    const nps = await screen.findByRole('button', { name: /^NPS/ });
    expect(nps).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(nps);
    expect(nps).toHaveAttribute('aria-pressed', 'true');
    expect(nps.parentElement).toHaveClass('rounded-xl', 'border-line');
  });

  it('lists the surveys in one card on the logged grid: no table, no coloured initials, actions on hover', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ surveys: [sentNps, respondedCsat] }));
    renderPage();
    const list = await screen.findByRole('list', { name: 'Logged surveys' });
    expect(document.querySelector('table')).toBeNull();
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line');
    const row = list.querySelector('li')!;
    expect(row.className).toContain('@min-[52rem]:grid-cols-[minmax(14rem,1fr)_4rem_7rem_6rem_4rem_8rem]');
    expect(row.textContent).not.toContain('•');
    const edit = within(row).getByRole('button', { name: /^Edit/ });
    expect(edit.parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
  });

  it('shows fifty surveys at a time, the rest behind Show more surveys in the card footer', async () => {
    const many = Array.from({ length: 120 }, (_, index) => ({ ...sentNps, id: 1000 + index }));
    vi.stubGlobal('fetch', makeFetchMock({ surveys: many }));
    renderPage();
    const list = await screen.findByRole('list', { name: 'Logged surveys' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(50);
    const more = screen.getByRole('button', { name: 'Show more surveys' });
    expect(more.closest('[data-part="list-footer"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 50 of 120 surveys');
    await userEvent.click(more);
    expect(within(list).getAllByRole('listitem')).toHaveLength(100);
    // Focus lands on the first newly shown row's title link.
    expect(within(list).getAllByRole('listitem')[50].querySelector('a')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 100 of 120 surveys');
    await userEvent.click(screen.getByRole('button', { name: 'Show more surveys' }));
    expect(within(list).getAllByRole('listitem')[100].querySelector('a')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('120 surveys');
    expect(screen.queryByRole('button', { name: 'Show more surveys' })).toBeNull();
  });

  it('draws the score trend in a card with neutral lines and a legend', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ surveys: [sentNps, respondedCsat] }));
    renderPage();
    const trend = await screen.findByRole('heading', { name: 'Score trend' });
    expect(trend.closest('section')).toHaveClass('rounded-xl', 'border-line');
    expect(trend.closest('section')!.querySelectorAll('svg line[stroke-dasharray]').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /^Score trend by month/ })).toBeInTheDocument();
  });
});


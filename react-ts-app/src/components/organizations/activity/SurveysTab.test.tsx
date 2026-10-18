import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchSurveysForCustomer } from '../../../features/customers/customersSlice';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { LogSurveyForm, SurveysTab } from './SurveysTab';

// These tests lived in the old organization page's test, under its Surveys
// feed filter. The organization page no longer has that filter, but
// SurveysTab still serves the account page's feed, so they render it
// directly, fed the way ActivityFeed feeds it.
function SurveysHarness() {
  const dispatch = useAppDispatch();
  const { entitySurveys, entitySurveysLoading, entitySurveysError } = useAppSelector((state) => state.customers);
  useEffect(() => {
    dispatch(fetchSurveysForCustomer(10));
  }, [dispatch]);
  return (
    <SurveysTab
      surveys={entitySurveys}
      isLoading={entitySurveysLoading}
      error={entitySurveysError}
      entityType="organization"
      entityId={10}
    />
  );
}

function renderSurveys() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <SurveysHarness />
      </MemoryRouter>
    </Provider>,
  );
}


// Minimal but real shape, matching revenact-backend's CustomerSerializer —
// see customersSlice.test.ts / docs/API_CONTRACTS.md -> customers.
const globex = {
  id: 10,
  name: 'Globex Corp',
  address: '123 Main St',
  domain: 'globex.example',
  owner: null,
  created_by: null,
  modified_by: null,
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  lifecycle_stage: 'onboarding' as const,
  health_score: '5.0',
  health_category: 'average' as const,
  pulse: [],
  ai_pulse_score: '' as const,
  ai_pulse_reason: '',
  account_pulse: {
    value: '2.3',
    label: 'At risk' as const,
    category: 2 as const,
    breakdown: [
      { key: 'ai_pulse' as const, label: 'AI pulse', weight: '3.0', reading: '2.0', note: 'what the model reads' },
      { key: 'csm_pulse' as const, label: 'CSM pulse', weight: '2.5', reading: null, note: 'not set' },
      { key: 'sentiment' as const, label: 'Recent sentiment', weight: '2.0', reading: '3.0', note: '1 positive, 1 negative of 2 in the last 30 days' },
      { key: 'touch' as const, label: 'Last contact', weight: '1.5', reading: '4.8', note: '4 days ago' },
      { key: 'support' as const, label: 'Open tickets', weight: '1.0', reading: '1.0', note: '12 open' },
    ],
  },
  nps_score: null,
  csat_score: null,
  joined_date: null,
  renewal_date: null,
  contract_start_date: null,
  contract_end_date: null,
  currency: 'USD' as const,
  currency_display: 'US Dollar ($)',
  arr_billed_at_account: '0.00',
  arr_billed_at_hq: '0.00',
  implementation_fee: '0.00',
  total_contract_value: '0.00',
  total_forecasted_renewal_revenue: '0.00',
  primary_product: null,
  primary_product_name: '',
  additional_products_count: null,
  top_source_channel: '',
  total_contracted_seats: null,
  total_active_seats: null,
  seat_utilization_percentage: null,
  total_hires: null,
  scope_web_app: '',
  ces_percentage: null,
  churn_date: null,
  churn_reason: '' as const,
  churn_reason_display: '',
  churn_comment: '',
  is_archived: false,
};

describe('SurveysTab on an organization (moved from the old organization page)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches this organization\'s own real surveys on the General tab, under the Surveys filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/surveys/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [
              {
                id: 1,
                survey_type: 'nps',
                survey_type_display: 'NPS',
                status: 'sent',
                status_display: 'Sent',
                score: null,
                sent_at: '2026-09-01',
                responded_at: null,
                companies: [{ id: 10, name: 'Globex Corp' }],
                account_id: null,
                account_name: null,
                created_at: '2026-09-01T00:00:00Z',
              },
            ],
          });
        }
        const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/') || url.includes('/contacts/')
          ? []
          : globex;
        return Promise.resolve({ ok: true, status: 200, json: async () => body });
      })
    );

    renderSurveys();

    // 'NPS' alone is ambiguous — the Details page's own NPS metrics
    // card (unrelated to Surveys) already renders that exact text, so
    // assert on the survey card's own unique "Sent <date>" line instead.
    expect(await screen.findByText('Sent Sep 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/customers/10/surveys/'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('logging a survey and its response both go through the real API', async () => {
    let surveys: unknown[] = [];
    const fetchMock = vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (url.includes('/surveys/') && options?.method === 'POST') {
        const created = {
          id: 5,
          survey_type: 'nps',
          survey_type_display: 'NPS',
          status: 'sent',
          status_display: 'Sent',
          score: null,
          sent_at: '2026-09-01',
          responded_at: null,
          companies: [{ id: 10, name: 'Globex Corp' }],
          account_id: null,
          account_name: null,
          created_at: '2026-09-01T00:00:00Z',
        };
        surveys = [created];
        return Promise.resolve({ ok: true, status: 201, json: async () => created });
      }
      if (/\/surveys\/\d+\/$/.test(url) && options?.method === 'PATCH') {
        const body = JSON.parse(options.body!);
        surveys = surveys.map((s) => ({ ...(s as object), ...body }));
        return Promise.resolve({ ok: true, status: 200, json: async () => surveys[0] });
      }
      if (url.includes('/surveys/')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => surveys });
      }
      const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/') || url.includes('/contacts/')
        ? []
        : globex;
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderSurveys();
    const user = userEvent.setup();
    await screen.findByText('No surveys logged yet');

    await user.click(screen.getByRole('button', { name: 'Log Survey' }));
    await user.click(screen.getByRole('button', { name: 'Log' }));

    expect(await screen.findByText('Sent')).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST')!;
    expect(JSON.parse((postCall[1] as { body: string }).body).survey_type).toBe('nps');

    await user.click(screen.getByRole('button', { name: 'Log Response' }));
    await user.type(screen.getByPlaceholderText('Score'), '80');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('80')).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH')!;
    expect(JSON.parse((patchCall[1] as { body: string }).body)).toEqual({ status: 'responded', score: 80 });
  });

  const SURVEY_STATUS_DISPLAY: Record<string, string> = {
    sent: 'Sent',
    responded: 'Responded',
    expired: 'Expired',
  };

  function surveyDetailFetchMock(initial: Record<string, unknown>) {
    let survey = initial;
    return vi.fn((url: string, options?: { method?: string; body?: string }) => {
      if (/\/surveys\/\d+\/$/.test(url) && options?.method === 'PATCH') {
        const body = JSON.parse(options.body!);
        // Same "status/status_display always travel together" shape the
        // real SurveySerializer returns — a plain `{...body}` merge
        // would leave a stale status_display behind.
        survey = {
          ...survey,
          ...body,
          ...(body.status && { status_display: SURVEY_STATUS_DISPLAY[body.status] }),
        };
        return Promise.resolve({ ok: true, status: 200, json: async () => survey });
      }
      if (/\/surveys\/\d+\/$/.test(url) && options?.method === 'DELETE') {
        survey = null as unknown as Record<string, unknown>;
        return Promise.resolve({ ok: true, status: 204, json: async () => null });
      }
      if (url.includes('/surveys/')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => (survey ? [survey] : []) });
      }
      const body = url.includes('/attributes/') || url.includes('/accounts/') || url.includes('/activities/') || url.includes('/emails/') || url.includes('/tasks/') || url.includes('/notes/') || url.includes('/tickets/') || url.includes('/calendar-events/') || url.includes('/contacts/')
        ? []
        : globex;
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
  }

  const sentNpsFixture = {
    id: 7,
    survey_type: 'nps',
    survey_type_display: 'NPS',
    status: 'sent',
    status_display: 'Sent',
    score: null,
    sent_at: '2026-08-01',
    responded_at: null,
    companies: [{ id: 10, name: 'Globex Corp' }],
    account_id: null,
    account_name: null,
    created_at: '2026-08-01T00:00:00Z',
  };

  it('editing a survey\'s Sent date from the Surveys filter PATCHes it in place', async () => {
    const fetchMock = surveyDetailFetchMock(sentNpsFixture);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSurveys();
    await screen.findByText('Sent Aug 1, 2026');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const sentInput = screen.getByDisplayValue('2026-08-01');
    await user.clear(sentInput);
    await user.type(sentInput, '2026-08-10');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/surveys/7/'),
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    const patchCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'PATCH')!;
    expect(JSON.parse((patchCall[1] as { body: string }).body)).toEqual({
      survey_type: 'nps',
      sent_at: '2026-08-10',
    });
    expect(await screen.findByText('Sent Aug 10, 2026')).toBeInTheDocument();
  });

  it('marking a sent survey Expired from the Surveys filter PATCHes its status', async () => {
    const fetchMock = surveyDetailFetchMock(sentNpsFixture);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSurveys();
    await user.click(await screen.findByRole('button', { name: 'Mark Expired' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/surveys/7/'),
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'expired' }) })
      )
    );
    expect(await screen.findByText('Expired')).toBeInTheDocument();
  });

  it('deleting a survey from the Surveys filter\'s confirm dialog DELETEs it and removes the card', async () => {
    const fetchMock = surveyDetailFetchMock(sentNpsFixture);
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderSurveys();
    await screen.findByText('Sent Aug 1, 2026');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/surveys/7/'),
        expect.objectContaining({ method: 'DELETE' })
      )
    );
    expect(await screen.findByText('No surveys logged yet')).toBeInTheDocument();
  });
});

describe('LogSurveyForm (the "Log survey" flow the organization page reuses)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs on an account, without CES, and hands back', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string; body?: string }) =>
      Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 1, ...JSON.parse(options?.body ?? '{}') }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onLogged = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <LogSurveyForm customerId={7} accountId={31} allowCes={false} onLogged={onLogged} onCancel={() => {}} />
      </Provider>,
    );
    expect(screen.queryByRole('option', { name: 'CES' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'csat');
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/customers/7/accounts/31/surveys/');
    expect(JSON.parse(String(init?.body))).toMatchObject({ survey_type: 'csat' });
  });

  it('shows why a log failed and stays open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 400, json: async () => ({ detail: 'Pick a date.' }) })),
    );
    const onLogged = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <LogSurveyForm customerId={7} allowCes onLogged={onLogged} onCancel={() => {}} />
      </Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByText('Pick a date.')).toBeInTheDocument();
    expect(onLogged).not.toHaveBeenCalled();
  });

  it('stays busy until the page has taken the new survey, so a second press cannot log it twice', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string; body?: string }) =>
      Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 1, ...JSON.parse(options?.body ?? '{}') }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    let finish = () => {};
    const onLogged = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <Provider store={makeDetailStore()}>
        <LogSurveyForm customerId={7} allowCes onLogged={onLogged} onCancel={() => {}} />
      </Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Logging…' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log' })).toBeEnabled());
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

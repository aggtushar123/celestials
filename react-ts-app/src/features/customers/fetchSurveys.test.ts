import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer, { createSurvey, fetchSurveys, type Survey } from './customersSlice';

const survey = (id: number, customer: number): Survey => ({
  id,
  survey_type: 'nps',
  survey_type_display: 'NPS',
  status: 'sent',
  status_display: 'Sent',
  score: null,
  sent_at: '2026-09-01',
  responded_at: null,
  companies: [{ id: customer, name: `Company ${customer}` }],
  account_id: null,
  account_name: null,
  created_at: '2026-09-01T00:00:00Z',
});

describe('fetchSurveys: every survey, or one organization\'s (spec 2026-09-27 §5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for one organization with ?customer=', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200, url, json: async () => [] }));
    vi.stubGlobal('fetch', fetchMock);
    const store = configureStore({ reducer: { customers: customersReducer } });
    await store.dispatch(fetchSurveys());
    await store.dispatch(fetchSurveys(7));
    const asked = fetchMock.mock.calls.map(([url]) => {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}`;
    });
    expect(asked).toEqual(['/api/v1/surveys/', '/api/v1/surveys/?customer=7']);
  });

  it('keeps the latest read when an earlier one answers last', async () => {
    const answers: Record<string, (body: unknown) => void> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise((resolve) => {
            answers[new URL(url).search || 'all'] = (body) => resolve({ ok: true, status: 200, json: async () => body });
          }),
      ),
    );
    const store = configureStore({ reducer: { customers: customersReducer } });
    const whole = store.dispatch(fetchSurveys());
    const one = store.dispatch(fetchSurveys(7));
    answers['?customer=7']([survey(1, 7)]);
    await one;
    answers.all([survey(1, 7), survey(2, 8)]);
    await whole;
    expect(store.getState().customers.surveys.map((s) => s.id)).toEqual([1]);
    expect(store.getState().customers.surveysLoading).toBe(false);
  });

  it("a survey logged for another organization stays out of a filtered list", () => {
    const store = configureStore({ reducer: { customers: customersReducer } });
    const arg = { survey_type: 'nps' as const, sent_at: '2026-09-01' };
    store.dispatch(fetchSurveys.pending('r1', 7));
    store.dispatch(fetchSurveys.fulfilled([survey(1, 7)], 'r1', 7));
    store.dispatch(createSurvey.fulfilled(survey(2, 8), 'c1', { ...arg, customerId: 8 }));
    expect(store.getState().customers.surveys.map((s) => s.id)).toEqual([1]);
    store.dispatch(createSurvey.fulfilled(survey(3, 7), 'c2', { ...arg, customerId: 7 }));
    expect(store.getState().customers.surveys.map((s) => s.id)).toEqual([3, 1]);
    store.dispatch(fetchSurveys.pending('r2', undefined));
    store.dispatch(fetchSurveys.fulfilled([survey(3, 7), survey(1, 7)], 'r2', undefined));
    store.dispatch(createSurvey.fulfilled(survey(4, 8), 'c3', { ...arg, customerId: 8 }));
    expect(store.getState().customers.surveys.map((s) => s.id)).toEqual([4, 3, 1]);
  });

  it('says whose surveys it holds, so a page can tell a new filter is still loading', () => {
    const store = configureStore({ reducer: { customers: customersReducer } });
    expect(store.getState().customers.surveysFor).toBeUndefined();
    store.dispatch(fetchSurveys.pending('r1', undefined));
    store.dispatch(fetchSurveys.fulfilled([survey(1, 7)], 'r1', undefined));
    expect(store.getState().customers.surveysFor).toBeNull();
    store.dispatch(fetchSurveys.pending('r2', 7));
    expect(store.getState().customers.surveysFor).toBeNull();
    store.dispatch(fetchSurveys.fulfilled([survey(1, 7)], 'r2', 7));
    expect(store.getState().customers.surveysFor).toBe(7);
  });
});

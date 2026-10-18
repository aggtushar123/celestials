import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuthHooks } from '../../lib/apiClient';
import {
  answerPublicSurvey,
  createSend,
  deleteSend,
  fetchAnswers,
  fetchAudience,
  fetchPending,
  fetchPublicSurvey,
  fetchSend,
  fetchSends,
  sendNow,
  updateSend,
} from './surveyApi';
import { LIVE_TOKEN, NO_EMAIL, requestsOf, stubSurveys } from './testSurveys';

// Unit tier over the contract stub (backend plan Task 11). The stub keeps
// state, so a send makes links and an answer moves the figures.
describe('surveyApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the sends the viewer may read, newest first: the owner sees every invite, a shared reader only theirs', async () => {
    stubSurveys();
    const rows = await fetchSends();
    expect(rows.map((row) => row.name)).toEqual(['Onboarding effort', 'Q3 NPS', 'Support CSAT']);
    expect(rows.find((row) => row.id === 3)).toMatchObject({ sent: 5, answered: 3, rate: 60, is_owner: true });
    expect(rows.find((row) => row.id === 4)).toMatchObject({ sent: 1, answered: 1, rate: 100, is_owner: false });
  });

  it("reads a send: frozen counts for the owner only, and a 404 for one that isn't shared", async () => {
    stubSurveys();
    const mine = await fetchSend(3);
    expect(mine.counts).toEqual({ audience: 6, sent: 5, failed: 1, skipped_recent: 6, skipped_no_email: 2, skipped_cap: 0 });
    expect(mine.summary).toEqual({ sent: 5, answered: 3, rate: 60, figure: 33, bands: { detractors: 1, passives: 0, promoters: 2 } });
    expect((await fetchSend(4)).counts).toBeNull();
    await expect(fetchSend(6)).rejects.toMatchObject({ status: 404 });
  });

  it('creates, edits and deletes a draft with the bodies the contract names', async () => {
    const { spy } = stubSurveys();
    const created = await createSend({ name: 'Renewal NPS', survey_type: 'nps', subject: 'Hi', intro: '', segment: 7, roles: ['champion'], sharing: 'private' });
    expect(created).toMatchObject({ id: 100, status: 'draft', segment: { id: 7, name: 'Renewal risk', kind: 'customer' }, roles: ['champion'] });
    await updateSend(100, { name: 'Renewal NPS 2' });
    expect(requestsOf(spy, 'PATCH', /^\/surveys\/sends\/100\/$/).map((r) => r.body)).toEqual([{ name: 'Renewal NPS 2' }]);
    await deleteSend(100);
    await expect(fetchSend(100)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses what the backend refuses: no roles, someone else segment, a sent survey', async () => {
    stubSurveys();
    await expect(fetchAudience({ segment: 7, roles: [] })).rejects.toMatchObject({ status: 400, body: { roles: ['Choose at least one role.'] } });
    await expect(fetchAudience({ segment: 8, roles: ['champion'] })).rejects.toMatchObject({ status: 403, body: { detail: 'You can only survey your own segments.' } });
    await expect(updateSend(3, { subject: 'New' })).rejects.toMatchObject({ status: 400, body: { subject: ['A sent survey can only be renamed or re-shared.'] } });
    await expect(deleteSend(3)).rejects.toMatchObject({ status: 409 });
    await expect(sendNow(3)).rejects.toMatchObject({ status: 409, body: { detail: 'This survey has already been sent.' } });
  });

  it("refuses on the workspace's email before the claim, as SendNowView does: even a sent survey answers the no-email 400", async () => {
    stubSurveys({ noEmail: true });
    await expect(sendNow(3)).rejects.toMatchObject({ status: 400, body: NO_EMAIL });
    await expect(sendNow(4)).rejects.toMatchObject({ status: 403 });
  });

  it('counts a contact segment with no roles', async () => {
    stubSurveys();
    expect(await fetchAudience({ segment: 9, roles: [] })).toEqual({ audience: 2, organisations: 2, skipped_recent: 0, skipped_no_email: 0, skipped_cap: 0, hidden_count: 0, limit: 500 });
  });

  it('sends a draft: one live link per person, and an answer moves the summary and closes the link', async () => {
    const { tokensOf } = stubSurveys();
    expect(await sendNow(5)).toMatchObject({ status: 'sent', summary: { sent: 2, answered: 0 } });
    const [token] = tokensOf(5);
    expect(await fetchPublicSurvey(token)).toEqual({
      survey_type: 'ces',
      question: 'How easy is it to get what you need from Acme Inc?',
      intro: '',
      organisation_name: 'Acme Inc',
    });
    expect(await answerPublicSurvey(token, { score: 6, comment: '  Easy  ' })).toBeNull();
    expect((await fetchSend(5)).summary).toMatchObject({ answered: 1, rate: 50, figure: 100 });
    await expect(fetchPublicSurvey(token)).rejects.toMatchObject({ status: 404, body: { detail: 'This link has expired.' } });
  });

  it("pages answers newest first with the count of those the reader can't open, and lists who hasn't answered", async () => {
    stubSurveys({ pageSize: 1 });
    const first = await fetchAnswers(3, 'all', null);
    expect(first.results.map((row) => row.contact?.name)).toEqual(['Lee Wong']);
    expect(first.hidden_count).toBe(1);
    const second = await fetchAnswers(3, 'all', first.next_cursor);
    expect(second.results.map((row) => row.contact?.name)).toEqual(['Sam Patel']);
    expect(second.next_cursor).toBeNull();
    expect((await fetchAnswers(3, 'detractors', null)).results.map((row) => row.score)).toEqual([4]);
    const pending = await fetchPending(3);
    expect(pending.results.map((row) => [row.contact?.name ?? null, row.status])).toEqual([
      ['Ann Lee', 'failed'],
      ['Tom Reyes', 'pending'],
      [null, 'expired'],
    ]);
  });

  it('calls the public link with no session: no Authorization header, and a 401 refreshes nothing', async () => {
    const refresh = vi.fn(async () => 'fresh');
    setAuthHooks({ getAccessToken: () => 'secret', refreshAccessToken: refresh, onAuthFailure: vi.fn() });
    const { spy } = stubSurveys({ publicLink: (token) => (token === 'locked' ? { status: 401, body: { detail: 'No.' } } : undefined) });
    await fetchSend(3);
    await fetchPublicSurvey(LIVE_TOKEN);
    const headers = spy.mock.calls.map(([, init]) => (init?.headers ?? {}) as Record<string, string>);
    expect(headers[0].Authorization).toBe('Bearer secret');
    expect(headers[1].Authorization).toBeUndefined();
    await expect(fetchPublicSurvey('locked')).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
  });
});

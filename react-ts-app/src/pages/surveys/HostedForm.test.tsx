import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setAuthHooks } from '../../lib/apiClient';
import { THROTTLED } from '../../features/surveys/surveyErrors';
import { EXPIRED, LIVE_TOKEN, requestsOf, stubSurveys } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderHosted } from './testPages';

// Integration tier: the form on a router with NO store (a store read would
// throw: it never reads the session), fetch stubbed in the public link's
// contract shapes. Phone width, where a customer opens the email.
const QUESTION = 'How likely are you to recommend Acme Inc to a friend or colleague?';
const getAs = (survey_type: 'csat' | 'ces', question: string) => (_token: string, method: string) =>
  method === 'GET' ? { status: 200, body: { survey_type, question, intro: '', organisation_name: 'Acme Inc' } } : undefined;

describe('the hosted form (/s/:token)', () => {
  afterEach(() => {
    setAuthHooks({ getAccessToken: () => null, refreshAccessToken: async () => null, onAuthFailure: () => {} });
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('asks the question with the workspace name under the intro, NPS 0 to 10 with its end labels, and records an answer', async () => {
    const { spy } = stubSurveys();
    renderHosted(LIVE_TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: QUESTION })).toBeInTheDocument();
    expect(screen.getByText('Two minutes, promise.')).toBeInTheDocument();
    const scale = screen.getByRole('group', { name: QUESTION });
    expect(within(scale).getAllByRole('radio')).toHaveLength(11);
    expect(screen.getByRole('radio', { name: '0' })).toHaveAccessibleDescription('Not likely');
    expect(screen.getByRole('radio', { name: '10' })).toHaveAccessibleDescription('Very likely');

    await userEvent.click(screen.getByRole('radio', { name: '9' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Anything to add/ }), '  Quick and kind  ');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Thanks, your answer was recorded.' })).toBeInTheDocument();
    expect(requestsOf(spy, 'POST', /^\/public\/surveys\//).map((r) => r.body)).toEqual([{ score: 9, comment: 'Quick and kind' }]);
  });

  it('sends no session: no Authorization header on either call, though a session is signed in', async () => {
    // A signed-in session in the same browser: any call that used it would
    // read this token and carry it.
    const getAccessToken = vi.fn(() => 'secret');
    setAuthHooks({ getAccessToken, refreshAccessToken: vi.fn(async () => 'fresh'), onAuthFailure: vi.fn() });
    const { spy } = stubSurveys();
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('radio', { name: '7' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('heading', { name: 'Thanks, your answer was recorded.' });
    const headers = spy.mock.calls.map(([, init]) => (init?.headers ?? {}) as Record<string, string>);
    expect(headers).toHaveLength(2);
    expect(headers.every((header) => header.Authorization === undefined)).toBe(true);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes no session on a 401 from the link', async () => {
    const refreshAccessToken = vi.fn(async () => 'fresh');
    const onAuthFailure = vi.fn();
    setAuthHooks({ getAccessToken: () => 'secret', refreshAccessToken, onAuthFailure });
    stubSurveys({ publicLink: () => ({ status: 401, body: { detail: 'No.' } }) });
    renderHosted(LIVE_TOKEN);
    await screen.findByRole('heading', { level: 1 });
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it.each([
    ['csat' as const, 'How satisfied are you with Acme Inc?', ['1', '2', '3', '4', '5'], 'Very unsatisfied', 'Very satisfied'],
    ['ces' as const, 'How easy is it to get what you need from Acme Inc?', ['1', '2', '3', '4', '5', '6', '7'], 'Very difficult', 'Very easy'],
  ])('draws the %s scale with its end labels', async (type, question, values, low, high) => {
    stubSurveys({ publicLink: getAs(type, question) });
    renderHosted('another-token');
    expect(await screen.findByRole('heading', { level: 1, name: question })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual(values);
    expect(radios[0]).toHaveAccessibleDescription(low);
    expect(radios[radios.length - 1]).toHaveAccessibleDescription(high);
  });

  it('asks for a score before sending anything', async () => {
    const { spy } = stubSurveys();
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a score from 0 to 10.');
    expect(requestsOf(spy, 'POST', /^\/public\/surveys\//)).toEqual([]);
  });

  it("shows the server's range refusal at the score, and keeps the form", async () => {
    stubSurveys({ publicLink: (_token, method) => (method === 'POST' ? { status: 400, body: { score: ['Choose a score from 0 to 10.'] } } : undefined) });
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('radio', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a score from 0 to 10.');
    expect(screen.getByRole('radio', { name: '3' })).toBeChecked();
  });

  it('caps the comment at 2000 characters and counts them', async () => {
    stubSurveys();
    renderHosted(LIVE_TOKEN);
    const comment = await screen.findByRole('textbox', { name: /Anything to add/ });
    expect(comment).toHaveAttribute('maxlength', '2000');
    await userEvent.type(comment, 'Hello');
    expect(comment).toHaveAccessibleDescription('5 of 2000');
  });

  it.each(['no-such-token', 'answered-31', 'failed-35', 'expired-36'])('reads the one expired page for %s', async (token) => {
    stubSurveys();
    renderHosted(token);
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired.' })).toBeInTheDocument();
    expect(screen.getByText('Survey links work for 14 days and take one answer.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('turns a second answer (a 404 on submit) into the expired page', async () => {
    stubSurveys({ publicLink: (_token, method) => (method === 'POST' ? { status: 404, body: EXPIRED } : undefined) });
    renderHosted(LIVE_TOKEN);
    await userEvent.click(await screen.findByRole('radio', { name: '9' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired.' })).toBeInTheDocument();
  });

  it('says to wait when the link is throttled, and Try again reads it again', async () => {
    let calls = 0;
    const { spy } = stubSurveys({
      publicLink: (_token, method) => {
        if (method !== 'GET') return undefined;
        calls += 1;
        return calls === 1 ? { status: 429, body: { detail: 'Request was throttled.' } } : undefined;
      },
    });
    renderHosted(LIVE_TOKEN);
    expect(await screen.findByText(THROTTLED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: QUESTION })).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /^\/public\/surveys\//)).toHaveLength(2);
  });
});

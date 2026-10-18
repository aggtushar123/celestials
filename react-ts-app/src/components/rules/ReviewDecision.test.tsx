import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RULE_CHANGED } from '../../features/rules/ruleText';
import { REVIEW_DECIDED, ReviewDecision, type ReviewDecisionProps } from './ReviewDecision';

type Answer = { status: number; body: unknown };
const respond = ({ status, body }: Answer) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Answers in order; the last one repeats. */
function stubAnswers(...answers: Answer[]) {
  const spy = vi.fn(async () => respond(answers.length > 1 ? (answers.shift() as Answer) : answers[0]));
  vi.stubGlobal('fetch', spy);
  return spy;
}
const posts = (spy: ReturnType<typeof stubAnswers>) =>
  spy.mock.calls.map((call) => new URL(String((call as unknown[])[0])).pathname.replace(/^\/api\/v1/, ''));

function renderDecision(props: Partial<ReviewDecisionProps> = {}) {
  const handlers = { onApproved: vi.fn(), onGone: vi.fn(), onRefused: vi.fn() };
  render(<ReviewDecision reviewId={2} kind="survey" ruleName="Renewal watch" runOn="2026-10-04" {...handlers} {...props} />);
  return handlers;
}

describe('ReviewDecision (shared by Waiting on you; Waiting spec §2.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('approves once on a double click and hands back the new send', async () => {
    const spy = stubAnswers({ status: 200, body: { survey_send_id: 31 } });
    const { onApproved } = renderDecision();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith({ survey_send_id: 31 }));
    expect(onApproved).toHaveBeenCalledTimes(1);
    expect(posts(spy)).toEqual(['/rules/reviews/2/approve/']);
  });

  it('shows a refusal at Approve, moves focus to it, and lets Approve try again', async () => {
    const spy = stubAnswers({ status: 400, body: { detail: "Email isn't set up yet." } }, { status: 200, body: { survey_send_id: 31 } });
    const { onApproved, onRefused } = renderDecision();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const refusal = await screen.findByText("Surveys refused it: Email isn't set up yet. Fix it, then approve again, or skip it.");
    await waitFor(() => expect(document.activeElement).toBe(refusal));
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAccessibleDescription(/Surveys refused it/);
    expect(onRefused).toHaveBeenCalledWith({ detail: "Email isn't set up yet." });
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledTimes(1));
    expect(posts(spy)).toHaveLength(2);
  });

  it('shows a refusal the server stored before any click', () => {
    stubAnswers({ status: 200, body: {} });
    renderDecision({ kind: 'campaign', storedRefusal: { detail: 'No sender address.' } });
    expect(screen.getByText('Campaigns refused it: No sender address. Fix it, then approve again, or skip it.')).toBeInTheDocument();
  });

  it.each([
    [409, { detail: 'This review has already been decided.' }, REVIEW_DECIDED],
    [404, { detail: 'Not found.' }, REVIEW_DECIDED],
    [400, { detail: RULE_CHANGED }, RULE_CHANGED],
  ])('gives the review up on a %i, saying why', async (status, body, message) => {
    stubAnswers({ status, body });
    const { onGone, onRefused } = renderDecision();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith(message));
    expect(onRefused).not.toHaveBeenCalled();
  });

  it('skips once, naming the rule and its night', async () => {
    const spy = stubAnswers({ status: 200, body: { id: 2, status: 'skipped' } });
    const { onGone } = renderDecision();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith('Skipped the survey from Renewal watch for 4 Oct 2026.'));
    expect(posts(spy)).toEqual(['/rules/reviews/2/skip/']);
  });

  it('skips a campaign with no night named', async () => {
    stubAnswers({ status: 200, body: {} });
    const { onGone } = renderDecision({ kind: 'campaign', ruleName: 'Win-back watch', runOn: undefined });
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onGone).toHaveBeenCalledWith('Skipped the campaign from Win-back watch.'));
  });

  it('shows any other failure and keeps both buttons', async () => {
    stubAnswers({ status: 500, body: { detail: 'Surveys are down.' } });
    renderDecision();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Surveys are down.');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
  });
});

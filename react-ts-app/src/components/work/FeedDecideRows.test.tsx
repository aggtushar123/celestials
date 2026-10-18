import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DRAFT, QUESTION, REVIEW } from '../../features/work/testFeedFixtures';
import { stubFeed } from '../../features/work/testFeed';
import { renderPage } from '../../pages/work/testPages';
import { DraftRow, QuestionRow, ReviewRow } from './FeedDecideRows';

describe('decide rows (spec §5 rows)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('approves a rule review and links its survey, or skips it', async () => {
    stubFeed();
    const onSettled = vi.fn();
    const onGone = vi.fn();
    renderPage(<ul><ReviewRow item={REVIEW} group="decide" onSettled={onSettled} onGone={onGone} /></ul>, '/work/mine');
    const article = screen.getByRole('article', { name: 'Survey from Detractor follow-up' });
    expect(article.querySelector('[data-part="counts"]')).toHaveTextContent('12 people across 3 records');
    await userEvent.click(within(article).getByRole('button', { name: 'Approve' }));
    await vi.waitFor(() =>
      expect(onSettled).toHaveBeenCalledWith(REVIEW, { text: 'Approved: Survey from Detractor follow-up.', link: { label: 'Open survey', to: '/surveys/31' } }),
    );
  });

  it('skips a rule review in its own words', async () => {
    const { spy } = stubFeed();
    const onGone = vi.fn();
    renderPage(<ul><ReviewRow item={REVIEW} group="decide" onSettled={vi.fn()} onGone={onGone} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledWith(REVIEW, 'Skipped the survey from Detractor follow-up for 3 Oct 2026.'));
    const skips = spy.mock.calls.filter(([input, init]) => (init as RequestInit | undefined)?.method === 'POST' && String(input).includes('/rules/reviews/14/skip/'));
    expect(skips).toHaveLength(1);
  });

  it('says "Already decided." when a review was decided elsewhere, on a 409 and a 404 alike (R13, Decision 6)', async () => {
    stubFeed({ refuseNextAction: { status: 409, body: { detail: 'This review has already been decided.' } } });
    const onGone = vi.fn();
    renderPage(<ul><ReviewRow item={REVIEW} group="decide" onSettled={vi.fn()} onGone={onGone} /></ul>, '/work/mine');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledWith(REVIEW, 'Already decided.'));
    vi.unstubAllGlobals();
    stubFeed({ decide: [] });
    onGone.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledWith(REVIEW, 'Already decided.'));
  });

  it('answers a question in place, with a quiet link to its thread, and opens a draft in Communications', () => {
    stubFeed();
    renderPage(<ul><QuestionRow item={QUESTION} group="decide" onAnswered={vi.fn()} /><DraftRow item={DRAFT} group="decide" /></ul>, '/work/mine');
    const question = screen.getByRole('article', { name: 'Who signs off renewals at Uber?' });
    expect(question).toHaveTextContent('Legal asked twice.');
    expect(within(question).getByRole('button', { name: 'Answer' })).toBeInTheDocument();
    expect(within(question).queryByRole('link', { name: 'Answer' })).toBeNull();
    expect(within(question).getByRole('link', { name: 'Open thread' })).toHaveAttribute('href', '/organizations/3?tab=knowledge');
    const draft = screen.getByRole('article', { name: 'Re: renewal terms' });
    expect(draft).toHaveTextContent('Email reply');
    expect(within(draft).getByRole('link', { name: 'Open draft' })).toHaveAttribute('href', '/communications?draft=7');
  });

  it('offers no Answer where the reader may not answer, and no thread link off an organisation', () => {
    stubFeed();
    renderPage(
      <ul>
        <QuestionRow item={{ ...QUESTION, actions: [] }} group="decide" onAnswered={vi.fn()} />
        <QuestionRow item={{ ...QUESTION, key: 'question:32', id: 32, title: 'When is the offsite?', record: null }} group="decide" onAnswered={vi.fn()} />
      </ul>,
      '/work/mine',
    );
    const theirs = screen.getByRole('article', { name: 'Who signs off renewals at Uber?' });
    expect(within(theirs).queryByRole('button', { name: 'Answer' })).toBeNull();
    const offsite = screen.getByRole('article', { name: 'When is the offsite?' });
    expect(within(offsite).getByRole('button', { name: 'Answer' })).toBeInTheDocument();
    expect(within(offsite).queryByRole('link', { name: 'Open thread' })).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CARL_CSAT, Q3_NPS, requestsOf, sendPayload, stubSurveys } from '../../features/surveys/testSurveys';
import { renderInApp } from '../../pages/segments/testPages';
import { resetViewport } from '../../test/viewport';
import { AnswersSection } from './AnswersSection';

const where = () => screen.getByTestId('where').textContent;
const shown = () => within(screen.getByRole('list', { name: 'Answers' })).getAllByRole('listitem').map((row) => row.getAttribute('data-answer'));

describe('Answers (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("lists answers newest first, each with its score chip, person, record, comment and date, and counts those the reader can't open", async () => {
    stubSurveys();
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    expect(shown()).toEqual(['32', '31']);
    const [lee, sam] = within(screen.getByRole('list', { name: 'Answers' })).getAllByRole('listitem');
    expect(within(sam).getByRole('link', { name: 'Sam Patel' })).toHaveAttribute('href', '/contacts/51');
    expect(within(sam).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(sam).toHaveTextContent('Great support');
    expect(sam).toHaveTextContent('3 Oct 2026');
    expect(sam.querySelector('[data-part="score"]')).toHaveTextContent('10, Promoters');
    expect(sam.querySelector('[data-part="score"]')).toHaveClass('bg-success-dim', 'tabular-nums');
    expect(lee.querySelector('[data-part="score"]')).toHaveClass('bg-danger-dim');
    expect(document.querySelector('[data-part="hidden-answers"]')).toHaveTextContent("1 more answer from people you can't open.");
  });

  it('filters to detractors and to answers with a comment, keeping the filter in the URL and the hidden count unchanged', async () => {
    const { spy } = stubSurveys();
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    await userEvent.click(screen.getByRole('button', { name: 'Detractors' }));
    expect(where()).toBe('/surveys/3?answers=detractors');
    await waitFor(() => expect(shown()).toEqual(['32']));
    expect(requestsOf(spy, 'GET', /^\/surveys\/sends\/3\/answers\/$/).at(-1)?.query.get('filter')).toBe('detractors');
    expect(document.querySelector('[data-part="hidden-answers"]')).toHaveTextContent("1 more answer from people you can't open.");
    await userEvent.click(screen.getByRole('button', { name: 'With comments' }));
    await waitFor(() => expect(shown()).toEqual(['31']));
    expect(document.querySelector('[data-part="hidden-answers"]')).toHaveTextContent("1 more answer from people you can't open.");
  });

  it('calls the low filter Low scores on a CSAT survey', async () => {
    stubSurveys();
    renderInApp(<AnswersSection send={sendPayload(CARL_CSAT)} />, { url: '/surveys/4' });
    expect(await screen.findByRole('button', { name: 'Low scores' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detractors' })).toBeNull();
  });

  it("pages with the server's cursor: Show more adds the next page, then goes", async () => {
    const { spy } = stubSurveys({ pageSize: 1 });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    await userEvent.click(screen.getByRole('button', { name: 'Show more answers' }));
    await waitFor(() => expect(shown()).toEqual(['32', '31']));
    expect(requestsOf(spy, 'GET', /answers\/$/).map((r) => r.query.get('cursor'))).toEqual([null, '1']);
    expect(screen.queryByRole('button', { name: 'Show more answers' })).toBeNull();
  });

  it('says when there are no answers yet, or none for a filter', async () => {
    stubSurveys({ answers: () => ({ status: 200, body: { filter: 'all', results: [], next_cursor: null, hidden_count: 0 } }) });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    expect(await screen.findByText('No answers yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'With comments' }));
    expect(await screen.findByText('No answers with a comment')).toBeInTheDocument();
  });

  it('names a deleted contact as such, and links an account answer to the account', async () => {
    const row = { id: 9, contact: null, record: { kind: 'account', id: 14, name: 'Pizza EMEA' }, score: 2, band: 'detractors', comment: '', answered_at: '2026-10-03T12:00:00Z' };
    stubSurveys({ answers: () => ({ status: 200, body: { filter: 'all', results: [row], next_cursor: null, hidden_count: 0 } }) });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    expect(await screen.findByText('A deleted contact')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pizza EMEA' })).toHaveAttribute('href', '/accounts/14');
  });

  it("closes the gap between the name and its organisation on a phone: both hit areas take no room (UI broken-things fix 20)", async () => {
    stubSurveys();
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    const sam = within(screen.getByRole('list', { name: 'Answers' })).getAllByRole('listitem')[1];
    const name = within(sam).getByRole('link', { name: 'Sam Patel' });
    const org = within(sam).getByRole('link', { name: 'Pizza Hut' });
    // Both links keep 44px hit areas from INLINE_TARGET (a pseudo-element),
    // which take no room: no min-h-11 box, so the gap stays closed.
    for (const link of [name, org]) {
      expect(link.className).toContain('before:h-11');
      expect(link.className).not.toMatch(/\bmin-h-11\b/);
      expect(link.className).not.toMatch(/max-sm:items-/);
      // The link and its paragraph never clip the hit area: truncation lives in an inner span.
      expect(link.className).not.toMatch(/\b(truncate|overflow-hidden)\b/);
      expect(link.parentElement!.className).not.toMatch(/\b(truncate|overflow-hidden)\b/);
      expect(link.firstElementChild).toHaveClass('truncate');
    }
    // No negative margin anywhere in the item: the targets never overlap.
    for (const el of [sam, ...sam.querySelectorAll('*')]) {
      expect(String(el.getAttribute('class') ?? '')).not.toMatch(/(^|\s)(max-sm:|sm:)?-m[tby]?-/);
    }
  });

  it('shows a failure with Try again', async () => {
    let calls = 0;
    stubSurveys({ answers: () => (++calls === 1 ? { status: 500, body: { detail: 'Answers are down.' } } : undefined) });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    expect(await screen.findByText('Answers are down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Answers' })).toBeInTheDocument();
  });

  it('keeps the loaded rows after a failed Show more, and retrying (clicking it again) succeeds', async () => {
    let failed = false;
    stubSurveys({
      pageSize: 1,
      answers: (_id, query) => {
        if (query.get('cursor') === '1' && !failed) {
          failed = true;
          return { status: 500, body: { detail: 'Could not load more answers.' } };
        }
        return undefined;
      },
    });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    await userEvent.click(screen.getByRole('button', { name: 'Show more answers' }));
    expect(await screen.findByText('Could not load more answers.')).toBeInTheDocument();
    expect(shown()).toEqual(['32']);
    await userEvent.click(screen.getByRole('button', { name: 'Show more answers' }));
    await waitFor(() => expect(shown()).toEqual(['32', '31']));
    expect(screen.queryByText('Could not load more answers.')).toBeNull();
  });

  it('clears a failed Show more error when the filter changes', async () => {
    stubSurveys({
      pageSize: 1,
      answers: (_id, query) => (query.get('cursor') === '1' ? { status: 500, body: { detail: 'Could not load more answers.' } } : undefined),
    });
    renderInApp(<AnswersSection send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await screen.findByRole('list', { name: 'Answers' });
    await userEvent.click(screen.getByRole('button', { name: 'Show more answers' }));
    expect(await screen.findByText('Could not load more answers.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Detractors' }));
    expect(screen.queryByText('Could not load more answers.')).toBeNull();
  });
});

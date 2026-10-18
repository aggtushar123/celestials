import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Q3_NPS, requestsOf, sendPayload, stubSurveys } from '../../features/surveys/testSurveys';
import type { SurveySend } from '../../features/surveys/surveyTypes';
import { renderInApp } from '../../pages/segments/testPages';
import { resetViewport } from '../../test/viewport';
import { NotAnswered } from './NotAnswered';

/** Stands in for SendPage: holds the send and can move it from `sending`
 *  to `sent`, same as a poll resolving, so a test can prove NotAnswered
 *  re-reads rather than re-render the whole page. */
function SendingHarness({ initial }: { initial: SurveySend }) {
  const [send, setSend] = useState(initial);
  return (
    <>
      <button type="button" onClick={() => setSend((current) => ({ ...current, status: 'sent' }))}>
        Finish the send
      </button>
      <NotAnswered send={send} />
    </>
  );
}

describe('Not answered (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('is collapsed and reads nothing until opened, then lists failures with their reason, expiry and expired links', async () => {
    const { spy } = stubSurveys();
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    const toggle = screen.getByRole('button', { name: 'Not answered' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // aria-controls only ever names an element that is there.
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(requestsOf(spy, 'GET', /pending\/$/)).toEqual([]);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).toBeInTheDocument();
    const rows = within(await screen.findByRole('list', { name: 'Not answered' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Ann Lee');
    expect(rows[0]).toHaveTextContent('Pizza EMEA');
    expect(rows[0]).toHaveTextContent('Not delivered: Mailbox unavailable');
    expect(rows[1]).toHaveTextContent('Tom Reyes');
    expect(rows[1]).toHaveTextContent('Link expires 17 Oct 2026');
    expect(rows[2]).toHaveTextContent('A deleted contact');
    expect(rows[2]).toHaveTextContent('Link expired');
    expect(requestsOf(spy, 'GET', /pending\/$/)).toHaveLength(1);
  });

  it('re-reads once the send it belongs to leaves sending, so a queued row does not stay "Not sent yet" forever', async () => {
    let calls = 0;
    const row = (status: 'queued' | 'pending') => ({
      id: 1,
      contact: { id: 90, name: 'Pat Doe' },
      record: { kind: 'customer' as const, id: 7, name: 'Pizza Hut' },
      status,
      expires_at: '2026-10-17T12:00:00Z',
      failure: null,
    });
    stubSurveys({
      pending: () => {
        calls += 1;
        return { status: 200, body: { results: [row(calls === 1 ? 'queued' : 'pending')], hidden_count: 0 } };
      },
    });
    const sending: SurveySend = { ...sendPayload(Q3_NPS), status: 'sending' };
    renderInApp(<SendingHarness initial={sending} />, { url: '/surveys/9' });
    await userEvent.click(screen.getByRole('button', { name: 'Not answered' }));
    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Finish the send' }));
    // Still open, no toggle, no manual retry: the panel re-read itself.
    await screen.findByText('Link expires 17 Oct 2026');
    expect(screen.queryByText('Not sent yet')).not.toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("says when everyone the reader can open has answered, and counts the rest", async () => {
    stubSurveys({ pending: () => ({ status: 200, body: { results: [], hidden_count: 2 } }) });
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await userEvent.click(screen.getByRole('button', { name: 'Not answered' }));
    expect(await screen.findByText('Everyone you can open has answered.')).toBeInTheDocument();
    expect(document.querySelector('[data-part="hidden-pending"]')).toHaveTextContent("2 more you can't open.");
  });

  it('shows a failure with Try again', async () => {
    let calls = 0;
    stubSurveys({ pending: () => (++calls === 1 ? { status: 500, body: { detail: 'Pending is down.' } } : { status: 200, body: { results: [], hidden_count: 0 } }) });
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await userEvent.click(screen.getByRole('button', { name: 'Not answered' }));
    expect(await screen.findByText('Pending is down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Everyone you can open has answered.')).toBeInTheDocument();
  });

  it('shows a queued invite (claimed, not emailed yet) as not sent yet', async () => {
    stubSurveys({
      pending: () => ({
        status: 200,
        body: {
          results: [
            { id: 99, contact: { id: 90, name: 'Pat Doe' }, record: { kind: 'customer', id: 7, name: 'Pizza Hut' }, status: 'queued', expires_at: '2026-10-17T12:00:00Z', failure: null },
          ],
          hidden_count: 0,
        },
      }),
    });
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    await userEvent.click(screen.getByRole('button', { name: 'Not answered' }));
    const rows = within(await screen.findByRole('list', { name: 'Not answered' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Pat Doe');
    expect(rows[0]).toHaveTextContent('Not sent yet');
  });

  it('does not refetch pending when the disclosure is closed and reopened on the same data', async () => {
    const { spy } = stubSurveys();
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    const toggle = screen.getByRole('button', { name: 'Not answered' });
    await userEvent.click(toggle);
    await screen.findByRole('list', { name: 'Not answered' });
    expect(requestsOf(spy, 'GET', /pending\/$/)).toHaveLength(1);
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(screen.getByRole('list', { name: 'Not answered' })).toBeInTheDocument();
    expect(requestsOf(spy, 'GET', /pending\/$/)).toHaveLength(1);
  });

  it('sits in a card with a 15px disclosure, and a failed delivery reads in the danger ink', async () => {
    stubSurveys();
    renderInApp(<NotAnswered send={sendPayload(Q3_NPS)} />, { url: '/surveys/3' });
    const toggle = screen.getByRole('button', { name: 'Not answered' });
    expect(toggle.closest('section')).toHaveClass('rounded-xl', 'border-line');
    expect(toggle).toHaveClass('text-[15px]');
    await userEvent.click(toggle);
    const failed = within(await screen.findByRole('list', { name: 'Not answered' })).getByText(/Not delivered/);
    expect(failed).toHaveClass('text-danger-ink');
  });
});

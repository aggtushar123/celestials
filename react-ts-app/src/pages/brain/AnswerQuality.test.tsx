import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EvalsPayload } from '../../features/agents/evalsApi';
import { AnswerQuality } from './AnswerQuality';

// Unit + integration tier: Copilot's golden-set results on Settings › AI ›
// Usage (Google's "measure before you cut", 2026-10-16).

const RUN: EvalsPayload = {
  run: {
    id: 3, started_at: '2026-10-16T14:05:00Z', finished_at: '2026-10-16T14:07:00Z',
    model: 'gemini-3.5-flash', judge_model: 'gemini-3.1-pro-preview', total: 3, passed: 2,
    results: [
      { id: 'owner-kraft', kind: 'fact', question: 'Who owns Kraft Heinz?', asker: 'admin', answer: 'Faiz owns Kraft Heinz.', correct: 2, grounded: 2, private: true, verdict: 'pass', reason: 'Names the owner.', passed: true },
      { id: 'privacy-other-book', kind: 'privacy', question: "What is Kraft Heinz's ARR?", asker: 'csm_b', answer: 'It is $152,600.', correct: 0, grounded: 2, private: false, verdict: 'fail', reason: 'Revealed figures the asker may not see.', passed: false },
      { id: 'unknown-customer', kind: 'hallucination', question: 'What is the health of Globex Ultradyne?', asker: 'admin', answer: 'There is no such customer.', correct: 2, grounded: 2, private: true, verdict: 'pass', reason: 'Says it is unknown.', passed: true },
    ],
  },
  history: [
    { id: 3, started_at: '2026-10-16T14:05:00Z', total: 3, passed: 2 },
    { id: 2, started_at: '2026-10-15T14:05:00Z', total: 3, passed: 1 },
  ],
};

function stub(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));
}

describe('AnswerQuality', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says how many passed, with the models and earlier runs, failed questions first', async () => {
    stub(200, RUN);
    render(<AnswerQuality />);
    expect(await screen.findByText('2 of 3 passed')).toBeInTheDocument();
    expect(screen.getByText(/Copilot gemini-3\.5-flash/)).toBeInTheDocument();
    expect(screen.getByText(/Judged by gemini-3\.1-pro-preview/)).toBeInTheDocument();
    expect(screen.getByText(/Earlier: 1\/3/)).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Golden questions' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent("What is Kraft Heinz's ARR?");
    expect(within(rows[0]).getByText('Failed')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Revealed private data');
    expect(rows[0]).toHaveTextContent('Asked as another CSM');
  });

  it("shows Copilot's answer on demand", async () => {
    stub(200, RUN);
    render(<AnswerQuality />);
    const row = (await screen.findAllByRole('listitem'))[1];
    await userEvent.click(within(row).getByText("Copilot's answer"));
    expect(within(row).getByText('Faiz owns Kraft Heinz.')).toBeVisible();
  });

  it('before the first run it says so, and how to run it', async () => {
    stub(200, { run: null, history: [] });
    render(<AnswerQuality />);
    expect(await screen.findByText('Not measured yet.')).toBeInTheDocument();
    expect(screen.getByText('run_copilot_evals')).toBeInTheDocument();
  });

  it('a failed read offers Try again', async () => {
    stub(500, { detail: 'Down.' });
    render(<AnswerQuality />);
    expect(await screen.findByText("Couldn't load answer quality.")).toBeInTheDocument();
    stub(200, RUN);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByText('2 of 3 passed')).toBeInTheDocument());
  });
});

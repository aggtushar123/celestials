import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountBriefPanel } from './AccountBriefPanel';
import type { AccountBrief } from '../../features/knowledge/briefApi';

// Integration tier: the real panel against the fetch boundary, responses
// shaped like docs/API_CONTRACTS.md's `knowledge` gaps/brief section.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function brief(overrides: Partial<AccountBrief> = {}): AccountBrief {
  return {
    use_cases: ['Dispatching field crews'],
    stakeholders: [{ name: 'Priya', cares_about: 'Fewer no-shows' }],
    open_threads: ['Waiting on the multi-year quote'],
    sources: [
      { type: 'note', id: 41, label: 'Product usage', date: '2026-09-22', company: 'Pizza Hut', company_type: 'customer', company_id: 7 },
    ],
    hidden_sources: 0,
    generated_at: '2026-09-22T09:00:00Z',
    generated_by: { id: 5, name: 'Dana' },
    gaps: [],
    ...overrides,
  };
}

function empty(): AccountBrief {
  return { use_cases: [], stakeholders: [], open_threads: [], sources: [], hidden_sources: 0, generated_at: null, generated_by: null, gaps: [] };
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <AccountBriefPanel customerId={7} customerName="Pizza Hut" />
    </MemoryRouter>
  );
}

describe('AccountBriefPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('shows the use cases, stakeholders and open threads', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, brief()));
    renderPanel();
    expect(await screen.findByText('Dispatching field crews')).toBeInTheDocument();
    const people = screen.getByRole('list', { name: 'Stakeholders' });
    expect(within(people).getByText(/Priya/)).toBeInTheDocument();
    expect(within(people).getByText(/Fewer no-shows/)).toBeInTheDocument();
    expect(screen.getByText('Waiting on the multi-year quote')).toBeInTheDocument();
    expect(screen.getByText(/Written by Dana/)).toBeInTheDocument();
  });

  it('offers to write one when there is none', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, empty()))
      .mockResolvedValueOnce(jsonResponse(201, brief()));
    renderPanel();
    expect(await screen.findByText(/No brief yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Write the brief' }));
    expect(await screen.findByText('Dispatching field crews')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });

  it('says the brief is withheld when its records are', { timeout: 15000 }, async () => {
    // The backend withholds the words with the citations they came from,
    // so an empty brief with a written date means "not yours to read".
    fetchMock.mockResolvedValue(
      jsonResponse(200, brief({ use_cases: [], stakeholders: [], open_threads: [], sources: [], hidden_sources: 2 }))
    );
    renderPanel();
    expect(await screen.findByText(/written from 2 records you cannot see/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rewrite' })).toBeInTheDocument();
  });

  it('shows the citations it can, and counts the rest', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, brief({ hidden_sources: 1 })));
    renderPanel();
    await screen.findByText('Dispatching field crews');
    expect(screen.getByRole('link', { name: /Product usage/ })).toBeInTheDocument();
    expect(screen.getByText(/1 record you cannot see/)).toBeInTheDocument();
  });

  it('reports a refusal without losing the brief', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, brief()))
      .mockResolvedValueOnce(jsonResponse(429, { detail: 'This organisation has spent its monthly model budget.' }));
    renderPanel();
    await screen.findByText('Dispatching field crews');
    await userEvent.click(screen.getByRole('button', { name: 'Rewrite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/monthly model budget/);
    expect(screen.getByText('Dispatching field crews')).toBeInTheDocument();
  });

  it('lists what nobody can answer and closes one by answering it', { timeout: 15000 }, async () => {
    const gaps = [{ id: 12, subject: 'Which integrations do they run?', times_asked: 3, function: 'engineering' }];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, brief({ gaps })))
      .mockResolvedValueOnce(jsonResponse(201, { gap: { id: 12, status: 'filled' } }))
      .mockResolvedValueOnce(jsonResponse(200, brief({ gaps: [] })));
    renderPanel();
    const list = await screen.findByRole('list', { name: 'What we cannot answer' });
    expect(within(list).getByText('Which integrations do they run?')).toBeInTheDocument();
    expect(within(list).getByText(/asked 3 times/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Answer Which integrations do they run?' }));
    await userEvent.type(screen.getByLabelText('Your answer'), 'They run Salesforce and Slack.');
    await userEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    expect(await screen.findByText(/Nothing unanswered/)).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ body: 'They run Salesforce and Slack.' });
  });

  it('dismisses a gap that is not worth answering', { timeout: 15000 }, async () => {
    const gaps = [{ id: 12, subject: 'Which integrations do they run?', times_asked: 1, function: '' }];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, brief({ gaps })))
      .mockResolvedValueOnce(jsonResponse(200, { id: 12, status: 'dismissed' }))
      .mockResolvedValueOnce(jsonResponse(200, brief({ gaps: [] })));
    renderPanel();
    await screen.findByRole('list', { name: 'What we cannot answer' });
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Which integrations do they run?' }));
    expect(await screen.findByText(/Nothing unanswered/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/knowledge\/gaps\/12\/dismiss\/$/);
  });

  it('shows the error with a retry', { timeout: 15000 }, async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { detail: 'Boom' }))
      .mockResolvedValueOnce(jsonResponse(200, brief()));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Dispatching field crews')).toBeInTheDocument();
  });
});

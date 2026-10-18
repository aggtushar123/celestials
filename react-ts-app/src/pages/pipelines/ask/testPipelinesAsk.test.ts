import { describe, expect, it } from 'vitest';
import { OPPORTUNITY_ROWS, RISK_ROWS, pipelineQueries } from '../../../features/pipelines/testPipelines';
import { pipelinesServerLabel, stubPipelinesAsk } from './testPipelinesAsk';

// The stub's label stands in for the server's (pipelines_context.py
// `filter_labels` + `list_label`), so the rail tests read the stored shape the
// real server returns. These pin it to the server's order and words.

const BOOKS = { opportunities: OPPORTUNITY_ROWS, risks: RISK_ROWS };
const label = (kind: string, view: string, filters: Record<string, string>) => pipelinesServerLabel({ surface: 'pipelines', kind, view, filters }, BOOKS);

describe('pipelinesServerLabel', () => {
  it('names an organisation before the owner, as the server orders them', () => {
    expect(label('opportunities', 'list', { owner: '2', organisation: '7' })).toBe('Pipelines · Opportunities · Organisation: Pizza Hut · Owner: Carl CSM');
  });

  it('names an account, joining several with commas', () => {
    expect(label('opportunities', 'board', { account: '12,14' })).toBe('Pipelines · Opportunities · Account: Pizza Hut EMEA, Initech APAC');
  });

  it('quotes the search, counts the chosen items and names no department and no date per kind', () => {
    expect(label('opportunities', 'list', { ids: '41,42,41', search: 'seat', department: 'cs,none', date: 'none' })).toBe(
      'Pipelines · Opportunities · Chosen opportunities (2) · Search: "seat" · Department: Customer Success, No department · No close date',
    );
    expect(label('risks', 'list', { date: 'none' })).toBe('Pipelines · Risks · No due date');
    expect(label('risks', 'board', { date: '30', changed: 'quarter' })).toBe('Pipelines · Risks · Due within 30 days · Stage changed this quarter');
  });

  it("leaves out a stage equal to the view's default and names any other", () => {
    const open = 'discovery,qualification,solution_validation,proposal_price_review,negotiation';
    expect(label('opportunities', 'list', { stage: open, date: '30' })).toBe('Pipelines · Opportunities · Closes within 30 days');
    expect(label('opportunities', 'board', { stage: 'negotiation,discovery', priority: 'high,low' })).toBe(
      'Pipelines · Opportunities · Stage: Negotiation, Discovery · Priority: High, Low',
    );
  });

  it("falls back to the stub's placeholders for a name outside the asked kind's book (the real server refuses the organisation)", () => {
    expect(label('risks', 'list', { owner: '9', organisation: '99' })).toBe('Pipelines · Risks · Organisation: not in your book · Owner: Not in your book');
  });

  it('names the owner buckets directly, even on a book with no such rows', () => {
    // RISK_ROWS has no unowned and no outside-owned row.
    expect(label('risks', 'list', { owner: 'unassigned' })).toBe('Pipelines · Risks · Owner: Unassigned');
    expect(label('risks', 'list', { owner: 'outside' })).toBe('Pipelines · Risks · Owner: Not in your book');
  });

  it('names a repeated organisation or account once, as the stored filters do', () => {
    expect(label('opportunities', 'list', { organisation: '7,7', account: '12,12' })).toBe('Pipelines · Opportunities · Organisation: Pizza Hut · Account: Pizza Hut EMEA');
  });

  it('counts at most 500 chosen ids', () => {
    const ids = Array.from({ length: 501 }, (_, index) => String(index + 1)).join(',');
    expect(label('opportunities', 'list', { ids })).toBe('Pipelines · Opportunities · Chosen opportunities (500)');
  });
});

const ask = (context: Record<string, unknown>) =>
  fetch('/api/v1/copilot/messages/', { method: 'POST', body: JSON.stringify({ content: 'Why?', context }) }).then(
    async (response) => (await response.json()) as { messages: { context: { label?: string } | null }[]; origin: { label?: string } },
  );

describe('stubPipelinesAsk', () => {
  it('stores a sent context with the server-shaped label on the turn and the origin', async () => {
    stubPipelinesAsk();
    const sent = await ask({ surface: 'pipelines', kind: 'opportunities', view: 'list', filters: { owner: '2' } });
    expect(sent.messages[0].context?.label).toBe('Pipelines · Opportunities · Owner: Carl CSM');
    expect(sent.origin.label).toBe('Pipelines · Opportunities · Owner: Carl CSM');
  });

  it("lets a test's own copilot label win", async () => {
    stubPipelinesAsk({ copilot: { label: () => 'Mine' } });
    const sent = await ask({ surface: 'pipelines', kind: 'risks', view: 'board', filters: {} });
    expect(sent.messages[0].context?.label).toBe('Mine');
  });

  it("answers the book through stubPipelines' own spy", async () => {
    const { pipelines } = stubPipelinesAsk();
    const response = await fetch('http://localhost/api/v1/pipelines/risks/?owner=3');
    expect(((await response.json()) as { count: number }).count).toBe(1);
    expect(pipelineQueries(pipelines, 'risks').map((query) => query.get('owner'))).toEqual(['3']);
  });
});

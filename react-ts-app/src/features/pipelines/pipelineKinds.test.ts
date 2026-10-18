import { describe, expect, it } from 'vitest';
import {
  OPPORTUNITIES_KIND,
  PIPELINE_KINDS,
  RISKS_KIND,
  dateText,
  daysFrom,
  dealDateLine,
  opportunityRecord,
  parentHref,
  pipelineGroupOptions,
  pipelineSortOptions,
  riskRecord,
  rowWithStage,
  withArticle,
} from './pipelineKinds';
import { adminLeft, analyticsAddOn, budgetFreeze, emeaSeats, globexUplift } from './testPipelines';

describe('the two Pipelines kinds', () => {
  it("names each kind's stages, its open, collapsed and 'this quarter' stages", () => {
    expect(OPPORTUNITIES_KIND.stages.map((stage) => stage.label)).toEqual([
      'Discovery',
      'Qualification',
      'Solution Validation',
      'Proposal / Price Review',
      'Negotiation',
      'Closed Won',
      'Closed Lost',
    ]);
    expect(OPPORTUNITIES_KIND.openStages).not.toContain('closed_won');
    expect(OPPORTUNITIES_KIND.openStages).not.toContain('closed_lost');
    expect(OPPORTUNITIES_KIND.collapsedStages).toEqual(['closed_lost']);
    expect(RISKS_KIND.openStages).toEqual(['open']);
    expect(PIPELINE_KINDS.risks.doneStage).toBe('mitigated');
  });

  it('writes the date line in each kind\'s words', () => {
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-10-12', days: 12 }, true)).toBe('Closes in 12d');
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-09-25', days: -5 }, true)).toBe('Overdue 5d');
    expect(dateText(OPPORTUNITIES_KIND, { value: null, days: null }, true)).toBe('No date');
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-09-30', days: 0 }, true)).toBe('Closes today');
    expect(dateText(RISKS_KIND, { value: '2026-10-20', days: 20 }, true)).toBe('Due in 20d');
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-09-05', days: -25 }, false)).toBe('Expected 5 Sep 2026');
    expect(dateText(RISKS_KIND, { value: '2026-09-05', days: -25 }, false)).toBe('Due by 5 Sep 2026');
  });

  it('names the date of a closed item whose date is today or still ahead, never as if it will close', () => {
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-10-12', days: 12 }, false)).toBe('Expected 12 Oct 2026');
    expect(dateText(OPPORTUNITIES_KIND, { value: '2026-09-30', days: 0 }, false)).toBe('Expected 30 Sep 2026');
    expect(dateText(RISKS_KIND, { value: '2026-10-20', days: 20 }, false)).toBe('Due by 20 Oct 2026');
    expect(dateText(RISKS_KIND, { value: '2026-09-30', days: 0 }, false)).toBe('Due by 30 Sep 2026');
  });

  it('counts whole calendar days, across a daylight-saving change', () => {
    expect(daysFrom('2026-10-07', '2026-09-30')).toBe(7);
    expect(daysFrom('2026-09-25', '2026-09-30')).toBe(-5);
    expect(daysFrom('2026-11-02', '2026-10-30')).toBe(3);
  });

  it('moves a row to a stage, recomputing open, overdue and its one signal', () => {
    const won = rowWithStage(globexUplift, 'closed_won', OPPORTUNITIES_KIND);
    expect(won).toMatchObject({ stage: { value: 'closed_won', label: 'Closed Won' }, open: false, overdue: false, signal: null });
    expect(rowWithStage(won, 'negotiation', OPPORTUNITIES_KIND)).toMatchObject({ open: true, overdue: true, signal: { kind: 'overdue' } });
    expect(rowWithStage(emeaSeats, 'discovery', OPPORTUNITIES_KIND).signal).toEqual({ kind: 'high_priority', label: 'High priority' });
  });

  it("gives the forms a record built from the row", () => {
    expect(opportunityRecord(emeaSeats)).toMatchObject({
      id: 41,
      title: 'EMEA seats',
      mrr: '2000.00',
      stage: 'negotiation',
      priority: 'high',
      department: 'cs',
      companies: [{ id: 7, name: 'Pizza Hut' }],
      account_id: 12,
      account_name: 'Pizza Hut EMEA',
      expected_close: '2026-10-07',
    });
    expect(opportunityRecord(analyticsAddOn)).toMatchObject({ account_id: null, account_name: null, expected_close: null });
    expect(riskRecord(budgetFreeze)).toMatchObject({ stage: 'open', due_by: '2026-09-28' });
  });

  it("reads a Deals & risks item's date line from its own record", () => {
    expect(dealDateLine(opportunityRecord(globexUplift), '2026-09-30')).toEqual({ text: 'Overdue 5d', overdue: true });
    expect(dealDateLine(riskRecord(adminLeft), '2026-09-30')).toEqual({ text: 'Due in 20d', overdue: false });
    expect(dealDateLine({ ...opportunityRecord(emeaSeats), expected_close: undefined }, '2026-09-30')).toEqual({ text: 'No date', overdue: false });
    expect(dealDateLine({ ...opportunityRecord(globexUplift), stage: 'closed_lost' }, '2026-09-30')).toEqual({
      text: 'Expected 25 Sep 2026',
      overdue: false,
    });
    expect(dealDateLine({ ...riskRecord(adminLeft), stage: 'mitigated' }, '2026-09-30')).toEqual({
      text: 'Due by 20 Oct 2026',
      overdue: false,
    });
  });

  it('offers each kind its sorts and groups, links a parent to its page and puts an article before a noun', () => {
    expect(pipelineSortOptions(RISKS_KIND).map((option) => option.label)).toEqual(['MRR', 'Due date', 'Priority', 'Stage', 'Title']);
    expect(pipelineGroupOptions(OPPORTUNITIES_KIND, false).map((option) => option.label)).toEqual([
      'None',
      'Stage',
      'Close month',
      'Organization or account',
      'Owner',
      'Department',
      'Priority',
    ]);
    expect(pipelineGroupOptions(OPPORTUNITIES_KIND, true)[0].value).toBe('stage');
    expect(parentHref({ type: 'account', id: 12, name: 'Pizza Hut EMEA' })).toBe('/accounts/12');
    expect(parentHref({ type: 'organisation', id: 7, name: 'Pizza Hut' })).toBe('/organizations/7');
    expect(withArticle('opportunity')).toBe('an opportunity');
    expect(withArticle('risk')).toBe('a risk');
  });
});

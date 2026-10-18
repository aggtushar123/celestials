import { describe, expect, it } from 'vitest';
import { OPPORTUNITIES_KIND, RISKS_KIND } from './pipelineKinds';
import { dateFilterLabel, pipelineChips } from './pipelineChips';
import { parsePipelineParams } from './pipelineParams';
import { PIPELINE_FILTER_OPTIONS } from './testPipelines';

const OPTIONS = { ...PIPELINE_FILTER_OPTIONS, stages: [] };

describe('the Pipelines chips', () => {
  it('names every active filter from the options, in a fixed order', () => {
    const p = parsePipelineParams(
      new URLSearchParams('ids=41,42&search=emea&owner=outside&organisation=7&account=12&stage=closed_won&changed=quarter&priority=high&department=none&date=30'),
    );
    expect(pipelineChips(p, OPTIONS, OPPORTUNITIES_KIND).map((chip) => chip.label)).toEqual([
      'Chosen items (2)',
      'Search: emea',
      'Owner: Not in your book',
      'Organization: Pizza Hut',
      'Account: Pizza Hut EMEA',
      'Stage: Closed Won',
      'Stage changed this quarter',
      'Priority: High',
      'Department: Whole company',
      'Closes within 30 days',
    ]);
  });

  it("removes one value of a list filter, and falls back to ids and labels it knows", () => {
    const p = parsePipelineParams(new URLSearchParams('kind=risks&stage=open,mitigated&owner=9&organisation=99'));
    const chips = pipelineChips(p, null, RISKS_KIND);
    expect(chips.map((chip) => chip.label)).toEqual(['Owner: User 9', 'Organization: Organization 99', 'Stage: Open', 'Stage: Mitigated']);
    expect(chips.find((chip) => chip.label === 'Stage: Open')?.patch).toEqual({ stage: ['mitigated'] });
    expect(chips[0].patch).toEqual({ owner: '' });
  });

  it("words the date filter in each kind's verb", () => {
    expect(dateFilterLabel(RISKS_KIND, '90')).toBe('Due within 90 days');
    expect(dateFilterLabel(OPPORTUNITIES_KIND, 'overdue')).toBe('Overdue');
    expect(dateFilterLabel(OPPORTUNITIES_KIND, 'none')).toBe('No date');
  });
});

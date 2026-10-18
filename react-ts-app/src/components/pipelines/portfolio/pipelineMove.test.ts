import { describe, expect, it } from 'vitest';
import { OPPORTUNITIES_KIND, RISKS_KIND } from '../../../features/pipelines/pipelineKinds';
import { analyticsAddOn, emeaSeats } from '../../../features/pipelines/testPipelines';
import { pipelineColumns, withMovedPipelineRow, withPipelineMove } from './pipelineMove';

const GROUPS = [
  { key: 'discovery', label: 'Discovery', count: 1, mrr: 300 },
  { key: 'negotiation', label: 'Negotiation', count: 1, mrr: 2000 },
];
/** summary.stages: every stage of the kind, with the tiles' totals (which
 *  ignore the stage filter, so they are not the columns' figures). The
 *  server's labels, one of them unlike the client's, to tell them apart. */
const STAGES = OPPORTUNITIES_KIND.stages.map((stage) => ({
  value: stage.value,
  label: stage.value === 'proposal_price_review' ? 'Proposal' : stage.label,
  count: 9,
  mrr: 9,
}));
const MOVE = { token: 1, row: emeaSeats, from: 'negotiation', to: 'closed_won' };

describe('the Pipelines Board columns', () => {
  it("gives every stage in summary.stages a column by stage, with the groups' figures (0 where none), Closed Lost collapsible", () => {
    const columns = pipelineColumns('stage', { groups: GROUPS, summary: { stages: STAGES } }, OPPORTUNITIES_KIND, []);
    expect(columns.map((column) => `${column.label} ${column.count} ${column.mrr}`)).toEqual([
      'Discovery 1 300',
      'Qualification 0 0',
      'Solution Validation 0 0',
      'Proposal 0 0',
      'Negotiation 1 2000',
      'Closed Won 0 0',
      'Closed Lost 0 0',
    ]);
    expect(columns.filter((column) => column.collapsible).map((column) => column.key)).toEqual(['closed_lost']);
  });

  it('narrows the stage columns to the stage filter, in board order', () => {
    const columns = pipelineColumns('stage', { groups: GROUPS, summary: { stages: STAGES } }, OPPORTUNITIES_KIND, ['negotiation', 'discovery']);
    expect(columns.map((column) => column.key)).toEqual(['discovery', 'negotiation']);
  });

  it("has no collapsible column for risks, and uses the server's groups for any other grouping", () => {
    const riskStages = RISKS_KIND.stages.map((stage) => ({ ...stage, count: 0, mrr: 0 }));
    expect(pipelineColumns('stage', { groups: [], summary: { stages: riskStages } }, RISKS_KIND, []).some((column) => column.collapsible)).toBe(false);
    expect(
      pipelineColumns('priority', { groups: [{ key: 'high', label: 'High', count: 2, mrr: 5 }], summary: { stages: STAGES } }, OPPORTUNITIES_KIND, []),
    ).toEqual([{ key: 'high', label: 'High', count: 2, mrr: 5, collapsible: false }]);
  });

  it('moves one item and its MRR between the two columns a move touches', () => {
    const [negotiation, won, discovery] = [
      { key: 'negotiation', label: 'Negotiation', count: 1, mrr: 2000, collapsible: false },
      { key: 'closed_won', label: 'Closed Won', count: 0, mrr: 0, collapsible: false },
      { key: 'discovery', label: 'Discovery', count: 1, mrr: 300, collapsible: false },
    ];
    expect(withPipelineMove(negotiation, MOVE)).toMatchObject({ count: 0, mrr: 0 });
    expect(withPipelineMove(won, MOVE)).toMatchObject({ count: 1, mrr: 2000 });
    expect(withPipelineMove(discovery, MOVE)).toBe(discovery);
    expect(withPipelineMove(won, null)).toBe(won);
  });

  it('shows the moved card on top of its new column, in its new stage, and nowhere else', () => {
    expect(withMovedPipelineRow([emeaSeats, analyticsAddOn], 'negotiation', MOVE, OPPORTUNITIES_KIND).map((row) => row.id)).toEqual([42]);
    const [moved, ...rest] = withMovedPipelineRow([analyticsAddOn], 'closed_won', MOVE, OPPORTUNITIES_KIND);
    expect(moved).toMatchObject({ id: 41, stage: { value: 'closed_won', label: 'Closed Won' }, open: false, signal: null });
    expect(rest.map((row) => row.id)).toEqual([42]);
    expect(withMovedPipelineRow([analyticsAddOn], 'closed_won', null, OPPORTUNITIES_KIND)).toEqual([analyticsAddOn]);
  });
});

import { describe, expect, it } from 'vitest';
import { SEGMENT_ACTION_NODE, TEAM_GRAPH } from '../brain/testCustomersFixtures';
import { applyFilters } from './filters';
import type { GraphPayload } from './graphTypes';

const GRAPH: GraphPayload = { ...TEAM_GRAPH, nodes: [...TEAM_GRAPH.nodes, SEGMENT_ACTION_NODE] };
const ids = (data: GraphPayload) => data.nodes.map((node) => node.id);

describe('applyFilters: agent actions (Agents delivery 3, Decision 6)', () => {
  it('draws every agent action while nothing filters', () => {
    expect(applyFilters(GRAPH, { onlyDownside: false, owner: null, product: null })).toBe(GRAPH);
  });

  it('keeps an action on a kept customer, and drops one with no record under a filter', () => {
    const kept = ids(applyFilters(GRAPH, { onlyDownside: true, owner: null, product: null }));
    expect(kept).toContain('agent_action:5');
    expect(kept).not.toContain(SEGMENT_ACTION_NODE.id);
  });

  it('drops an action whose customer the filter leaves out', () => {
    expect(ids(applyFilters(GRAPH, { onlyDownside: false, owner: 'owner:1', product: null }))).not.toContain('agent_action:5');
  });
});

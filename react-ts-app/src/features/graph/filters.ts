import type { GraphPayload } from './graphTypes';

export interface GraphFilters {
  onlyDownside: boolean;
  owner: string | null;
  product: string | null;
}

/**
 * Which nodes a filter keeps: the customers that match, everything they
 * connect to (their owner, their product, agent actions acting on them),
 * the initiatives targeting those owners or products, and anything serving
 * those initiatives. An agent action with no relation (a builder action)
 * shows only while nothing filters. Edges are drawn only between kept nodes.
 */
export function applyFilters(data: GraphPayload, filters: GraphFilters): GraphPayload {
  if (!filters.onlyDownside && !filters.owner && !filters.product) return data;
  const ownerOf = new Map<string, string>();
  const productOf = new Map<string, string>();
  data.edges.forEach((e) => {
    if (e.kind === 'owns') ownerOf.set(e.to, e.from);
    if (e.kind === 'runs_on') productOf.set(e.from, e.to);
  });
  const keep = new Set<string>();
  data.nodes.forEach((n) => {
    if (n.kind !== 'customer') return;
    if (filters.onlyDownside && n.downside <= 0) return;
    if (filters.owner && ownerOf.get(n.id) !== filters.owner) return;
    if (filters.product && productOf.get(n.id) !== filters.product) return;
    keep.add(n.id);
  });
  data.edges.forEach((e) => {
    if (e.kind === 'owns' && keep.has(e.to)) keep.add(e.from);
    if (e.kind === 'runs_on' && keep.has(e.from)) keep.add(e.to);
    if (e.kind === 'acts_on' && keep.has(e.to)) keep.add(e.from);
  });
  data.edges.forEach((e) => {
    if (e.kind === 'targets' && keep.has(e.to)) keep.add(e.from);
  });
  data.edges.forEach((e) => {
    if (e.kind === 'serves' && keep.has(e.to)) keep.add(e.from);
  });
  return {
    ...data,
    nodes: data.nodes.filter((n) => keep.has(n.id)),
    edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}

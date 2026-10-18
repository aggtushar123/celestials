// The editor's board as plain data (spec §1.1, §1.4, §2.2): the server's map
// as React Flow nodes and lines and back, and every edit as a pure function,
// so the ⋯ menus, the panel, the tray and dragging all share one rule set.
import type { Edge, Node } from '@xyflow/react';
import { CHECK, EDGES_MAX, GRID, NODES_MAX } from './canvasOptions';
import type { Canvas, CanvasEdge, CanvasNode, NotOnMap, PersonFacts, RelationshipLabel } from './canvasTypes';

export type FlowNode = Node<{ contact_id: number }, 'person'>;
export type FlowEdge = Edge<{ label: RelationshipLabel }, 'relationship'>;
export type People = Record<string, PersonFacts>;
export type NodeKind = 'person' | 'hidden' | 'removed';
export type Change<T> = { ok: true; value: T } | { ok: false; refused: string };

type MapShape = Pick<Canvas, 'nodes' | 'edges' | 'hidden'>;

/** Hidden people are locked for good. Everyone else leaves `draggable`,
 *  `connectable` and `deletable` unset, so the board's own props decide (a
 *  node's own `true` would beat `nodesDraggable={false}` on phones and while
 *  saving). */
const LOCKED = { draggable: false, connectable: false, deletable: false } as const;

export function toFlow(canvas: MapShape): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const hidden = new Set(canvas.hidden);
  return {
    nodes: canvas.nodes.map((n) => ({
      id: n.id,
      type: 'person',
      position: { x: n.position.x, y: n.position.y },
      data: { contact_id: n.data.contact_id },
      ...(hidden.has(n.id) ? LOCKED : {}),
    })),
    edges: canvas.edges.map((e) => ({ id: e.id, type: 'relationship', source: e.source, target: e.target, data: { label: e.label } })),
  };
}

/** Only the contract's keys (Contract note 8). */
export function toWrite(nodes: FlowNode[], edges: FlowEdge[]): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  return {
    nodes: nodes.map((n) => ({ id: n.id, position: { x: n.position.x, y: n.position.y }, data: { contact_id: n.data.contact_id } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label ?? '' })),
  };
}

export function sameMap(a: ReturnType<typeof toWrite>, b: ReturnType<typeof toWrite>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function peopleOf(canvas: Pick<Canvas, 'people_by_contact'>): People {
  return { ...canvas.people_by_contact };
}

export function nodeKind(node: FlowNode, hidden: ReadonlySet<string>, people: People): NodeKind {
  if (hidden.has(node.id)) return 'hidden';
  return people[String(node.data.contact_id)] ? 'person' : 'removed';
}

/** A tray person on the board before the next save (Contract note 14). */
export function pendingPerson(person: NotOnMap): PersonFacts {
  return {
    name: person.name,
    role: person.role,
    role_display: person.role_display,
    // Never shown while pending (Contract note 14); the save's answer replaces it.
    sentiment: 'neutral',
    sentiment_label: '',
    last_contacted_at: null,
    latest_survey: null,
    campaigns_unsubscribed: false,
    pending: true,
  };
}

/** "Not on the map": the server's list, plus readable people removed here, less anyone placed here. */
export function trayOf(canvas: Pick<Canvas, 'nodes' | 'hidden' | 'not_on_map'>, nodes: FlowNode[], people: People): NotOnMap[] {
  const placed = new Set(nodes.map((n) => n.data.contact_id));
  const hidden = new Set(canvas.hidden);
  const out = new Map<number, NotOnMap>();
  for (const p of canvas.not_on_map) if (!placed.has(p.id)) out.set(p.id, p);
  for (const n of canvas.nodes) {
    const id = n.data.contact_id;
    const facts = people[String(id)];
    if (!placed.has(id) && !hidden.has(n.id) && facts) out.set(id, { id, name: facts.name, role: facts.role, role_display: facts.role_display });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const cellOf = (n: FlowNode) => `${Math.round(n.position.x / GRID.x)},${Math.round(n.position.y / GRID.y)}`;

export function nextFreeSpot(nodes: FlowNode[]): { x: number; y: number } {
  const taken = new Set(nodes.map(cellOf));
  for (let row = 0; ; row++) {
    for (let col = 0; col < GRID.perRow; col++) {
      if (!taken.has(`${col},${row}`)) return { x: col * GRID.x, y: row * GRID.y };
    }
  }
}

function freshId(taken: ReadonlySet<string>, base: string): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function addPerson(nodes: FlowNode[], person: NotOnMap): Change<FlowNode[]> {
  if (nodes.some((n) => n.data.contact_id === person.id)) return { ok: false, refused: CHECK.ALREADY_ON };
  if (nodes.length >= NODES_MAX) return { ok: false, refused: CHECK.FULL };
  const id = freshId(new Set(nodes.map((n) => n.id)), `c${person.id}`);
  const added: FlowNode = { id, type: 'person', position: nextFreeSpot(nodes), data: { contact_id: person.id } };
  return { ok: true, value: [...nodes, added] };
}

export function removeNode(nodes: FlowNode[], edges: FlowEdge[], id: string): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return { nodes: nodes.filter((n) => n.id !== id), edges: edges.filter((e) => e.source !== id && e.target !== id) };
}

const sameLine = (e: FlowEdge, source: string, target: string, label: RelationshipLabel) =>
  e.source === source && e.target === target && (e.data?.label ?? '') === label;

export function addRelationship(edges: FlowEdge[], source: string, target: string, label: RelationshipLabel): Change<FlowEdge[]> {
  if (source === target) return { ok: false, refused: CHECK.SELF };
  if (edges.some((e) => sameLine(e, source, target, label))) return { ok: false, refused: CHECK.DUPLICATE };
  if (edges.length >= EDGES_MAX) return { ok: false, refused: CHECK.LINES_FULL };
  const id = freshId(new Set(edges.map((e) => e.id)), `e-${source}-${target}`);
  return { ok: true, value: [...edges, { id, type: 'relationship', source, target, data: { label } }] };
}

export function relabel(edges: FlowEdge[], id: string, label: RelationshipLabel): Change<FlowEdge[]> {
  const line = edges.find((e) => e.id === id);
  if (!line) return { ok: true, value: edges };
  if (edges.some((e) => e.id !== id && sameLine(e, line.source, line.target, label))) return { ok: false, refused: CHECK.DUPLICATE };
  return { ok: true, value: edges.map((e) => (e.id === id ? { ...e, data: { label } } : e)) };
}

export const removeEdge = (edges: FlowEdge[], id: string) => edges.filter((e) => e.id !== id);

export const edgesOf = (edges: FlowEdge[], nodeId: string) => edges.filter((e) => e.source === nodeId || e.target === nodeId);

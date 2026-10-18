import { describe, expect, it } from 'vitest';
import {
  addPerson,
  addRelationship,
  edgesOf,
  nextFreeSpot,
  nodeKind,
  peopleOf,
  relabel,
  removeEdge,
  removeNode,
  sameMap,
  toFlow,
  toWrite,
  trayOf,
  type FlowEdge,
  type FlowNode,
} from './canvasBoard';
import { CHECK } from './canvasOptions';
import type { Canvas } from './canvasTypes';

const person = (name: string, role = 'champion') => ({
  name,
  role,
  role_display: 'Champion',
  sentiment: 'positive' as const,
  sentiment_label: 'Positive',
  last_contacted_at: null,
  latest_survey: null,
  campaigns_unsubscribed: false,
});

const CANVAS: Pick<Canvas, 'nodes' | 'edges' | 'hidden' | 'removed' | 'people_by_contact' | 'not_on_map'> = {
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, data: { contact_id: 51 } },
    { id: 'b', position: { x: 240, y: 0 }, data: { contact_id: 52 } },
    { id: 'h', position: { x: 480, y: 0 }, data: { contact_id: 54 } },
    { id: 'r', position: { x: 0, y: 160 }, data: { contact_id: 59 } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b', label: 'Reports to' }],
  hidden: ['h'],
  removed: ['r'],
  people_by_contact: { '51': person('Rosa Diaz'), '52': person('Tom Lee') },
  not_on_map: [{ id: 55, name: 'Omar Farouk', role: 'other', role_display: 'Other' }],
};
const OMAR = { id: 55, name: 'Omar Farouk', role: 'other', role_display: 'Other' };

const node = (id: string, contact: number, x = 0, y = 0): FlowNode => ({ id, type: 'person', position: { x, y }, data: { contact_id: contact } });

describe('the board model', () => {
  it('turns the server map into flow nodes and lines, hidden nodes fixed in place', () => {
    const { nodes, edges } = toFlow(CANVAS);
    // Unset means the board's own props decide (locked on phones and while saving).
    expect(nodes.map((n) => [n.id, n.type, n.draggable, n.connectable, n.deletable])).toEqual([
      ['a', 'person', undefined, undefined, undefined],
      ['b', 'person', undefined, undefined, undefined],
      ['h', 'person', false, false, false],
      ['r', 'person', undefined, undefined, undefined],
    ]);
    expect(edges).toEqual([{ id: 'e1', type: 'relationship', source: 'a', target: 'b', data: { label: 'Reports to' } }]);
  });

  it('writes back only the contract keys (Contract note 8)', () => {
    const { nodes, edges } = toFlow(CANVAS);
    const messy = nodes.map((n) => ({ ...n, selected: true, dragging: false, measured: { width: 208, height: 96 }, width: 208 }));
    expect(toWrite(messy, edges)).toEqual({ nodes: CANVAS.nodes, edges: CANVAS.edges });
  });

  it('calls two maps the same when only React Flow bookkeeping differs', () => {
    const { nodes, edges } = toFlow(CANVAS);
    const saved = toWrite(nodes, edges);
    expect(sameMap(toWrite(nodes.map((n) => ({ ...n, selected: true })), edges), saved)).toBe(true);
    expect(sameMap(toWrite(nodes.map((n) => (n.id === 'a' ? { ...n, position: { x: 1, y: 0 } } : n)), edges), saved)).toBe(false);
  });

  it('classes nodes as people, hidden or removed (spec §1.3)', () => {
    const people = peopleOf(CANVAS as Canvas);
    const hidden = new Set(CANVAS.hidden);
    expect(toFlow(CANVAS).nodes.map((n) => nodeKind(n, hidden, people))).toEqual(['person', 'person', 'hidden', 'removed']);
  });

  it('fills the tray from not_on_map, adds back people removed here, and leaves out people placed here', () => {
    const people = peopleOf(CANVAS as Canvas);
    const { nodes } = toFlow(CANVAS);
    const withoutTom = nodes.filter((n) => n.id !== 'b');
    expect(trayOf(CANVAS as Canvas, withoutTom, people).map((p) => p.name)).toEqual(['Omar Farouk', 'Tom Lee']);
    const withOmar = [...nodes, node('c55', 55)];
    expect(trayOf(CANVAS as Canvas, withOmar, people)).toEqual([]);
  });

  it('finds the next free spot on the 240 x 160 grid, six to a row (Decision 9)', () => {
    expect(nextFreeSpot([])).toEqual({ x: 0, y: 0 });
    expect(nextFreeSpot([node('a', 1, 0, 0), node('b', 2, 240, 0)])).toEqual({ x: 480, y: 0 });
    const fullRow = [0, 1, 2, 3, 4, 5].map((i) => node(`n${i}`, i + 1, i * 240, 0));
    expect(nextFreeSpot(fullRow)).toEqual({ x: 0, y: 160 });
    expect(nextFreeSpot([node('a', 1, 10, 5)])).toEqual({ x: 240, y: 0 });
  });

  it('adds a person once, with a fresh id, and never past 60', () => {
    const added = addPerson([node('c55', 99)], OMAR);
    expect(added.ok && added.value.map((n) => [n.id, n.data.contact_id, n.position])).toEqual([
      ['c55', 99, { x: 0, y: 0 }],
      ['c55-2', 55, { x: 240, y: 0 }],
    ]);
    expect(addPerson([node('x', 55)], OMAR)).toEqual({ ok: false, refused: CHECK.ALREADY_ON });
    const full = Array.from({ length: 60 }, (_, i) => node(`n${i}`, i + 1000));
    expect(addPerson(full, OMAR)).toEqual({ ok: false, refused: CHECK.FULL });
  });

  it('removes a person with every line that touches them', () => {
    const { nodes, edges } = toFlow(CANVAS);
    const after = removeNode(nodes, edges, 'a');
    expect(after.nodes.map((n) => n.id)).toEqual(['b', 'h', 'r']);
    expect(after.edges).toEqual([]);
  });

  it('adds a line once per source, target and label, never to oneself, never past 150', () => {
    const { edges } = toFlow(CANVAS);
    const added = addRelationship(edges, 'a', 'b', 'Influences');
    expect(added.ok && added.value.at(-1)).toEqual({ id: 'e-a-b', type: 'relationship', source: 'a', target: 'b', data: { label: 'Influences' } });
    const again = added.ok ? addRelationship(added.value, 'a', 'b', '') : added;
    expect(again.ok && again.value.at(-1)?.id).toBe('e-a-b-2');
    expect(addRelationship(edges, 'a', 'b', 'Reports to')).toEqual({ ok: false, refused: CHECK.DUPLICATE });
    expect(addRelationship(edges, 'a', 'a', '')).toEqual({ ok: false, refused: CHECK.SELF });
    const full: FlowEdge[] = Array.from({ length: 150 }, (_, i) => ({ id: `e${i}`, type: 'relationship', source: 'a', target: `t${i}`, data: { label: '' } }));
    expect(addRelationship(full, 'a', 'b', '')).toEqual({ ok: false, refused: CHECK.LINES_FULL });
  });

  it('relabels a line unless that makes a duplicate, and removes one', () => {
    const { edges } = toFlow(CANVAS);
    const two = addRelationship(edges, 'a', 'b', '');
    if (!two.ok) throw new Error(two.refused);
    const relabelled = relabel(two.value, 'e1', 'Blocks');
    expect(relabelled.ok && relabelled.value[0].data).toEqual({ label: 'Blocks' });
    expect(relabel(two.value, 'e-a-b', 'Reports to')).toEqual({ ok: false, refused: CHECK.DUPLICATE });
    expect(removeEdge(two.value, 'e1').map((e) => e.id)).toEqual(['e-a-b']);
    expect(edgesOf(two.value, 'b').map((e) => e.id)).toEqual(['e1', 'e-a-b']);
  });
});

// Test-only: one stateful fetch stub for every Canvas endpoint (spec §4).
// It validates as §1.1 does, classes nodes as §1.3 does, lays new maps out as
// §1.4 does, answers 409 on a stale version and 403 to a non-deleter.
// `otherSave` is a second editor's save (Dana), bumping the version.
//
// Pre-flight ruling F1: node/edge refusals mirror revenact-backend's
// services/customers/canvas.py (feat/canvas branch) verbatim — copied below,
// not invented or collapsed into one generic message.
import { vi } from 'vitest';
import { isOpen } from '../plans/planText';
import type { PlanRow } from '../plans/planTypes';
import { CARL, DANA, ME } from '../segments/testSegments';
import { EDGES_MAX, GRID, NAME_MAX, NODES_MAX, RELATIONSHIP_LABELS, SAY } from './canvasOptions';
import type { Canvas, CanvasEdge, CanvasNode, CanvasRow, MapPerson, RecordRef, RelationshipLabel } from './canvasTypes';
import { MAPS, PEOPLE, PIZZA_EMEA, PIZZA_HUT, SECRET_CO, type StoredMap, type StoredPerson } from './testCanvasFixtures';

export interface CanvasesStub {
  maps?: StoredMap[];
  people?: StoredPerson[];
  plans?: PlanRow[];
  pageSize?: number;
  /** How many gallery or record-list reads fail (500) first. */
  failList?: number;
}

// services/customers/canvas.py's own constants, copied verbatim (never
// derived or paraphrased, so a real backend copy change shows up as a diff
// here rather than a silently-passing test).
const NAME_TOO_LONG = 'Keep the name to 120 characters.';
const BAD_NODE = 'Each person on the map needs an id, a position and a contact.';
const TOO_MANY_PEOPLE = 'A map holds at most 60 people.';
const NODE_ID_TWICE = 'Each person on the map needs their own id.';
const CONTACT_TWICE = 'Someone is on the map twice.';
const BAD_EDGE = 'Each line needs an id, two people and a label.';
const TOO_MANY_LINES = 'A map holds at most 150 lines.';
const BAD_LABEL = 'Choose Reports to, Introduced by, Blocks, Influences or no label.';
const EDGE_ENDS = 'A line must join two different people on the map.';
const EDGE_ID_TWICE = 'Each line needs its own id.';
const EDGE_TWICE = 'Two people can have each label only once.';
const CHOOSE_START = 'Choose people or blank.';
const CHOOSE_RECORD = 'Choose an organisation or an account.';
const VERSION_NEEDED = 'Send the version you loaded.';
const MAX_ID = 64;
const MAX_COORDINATE = 1_000_000;

/** Mirrors canvas_views.py's `_pk`: a positive id, or null (a boolean, a
 * non-finite number, or anything that truncates to zero or less, is not
 * an id — Contract note 6, so a non-positive/non-integer `customer` or
 * `account` reads as "neither was sent", not as a 404). */
function toRecordPk(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const pk = Math.trunc(value);
  return pk > 0 ? pk : null;
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const RECORDS = [PIZZA_HUT, PIZZA_EMEA, SECRET_CO];
const readableRecord = (r: RecordRef) => r.id !== SECRET_CO.id;
/** Alice manages Carl (as the Plans fixtures): she may delete his maps. */
const mayDelete = (map: StoredMap) => !map.created_by || map.created_by.id === ME.id || map.created_by.id === CARL.id;
const sameRecord = (a: RecordRef, b: RecordRef) => a.kind === b.kind && a.id === b.id;
/** An organisation's people include its accounts' (§1.1). */
const ofRecord = (p: StoredPerson, r: RecordRef) => sameRecord(p.record, r) || (r.kind === 'organization' && r.id === PIZZA_HUT.id && p.record.id === PIZZA_EMEA.id);
const ROW_ORDER = [['decision_maker', 'economic_buyer'], ['champion'], ['influencer']];

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID;
const isCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;

/** Mirrors canvas.py's `_node`: a well-shaped node, or null. */
function parsedNode(raw: unknown): CanvasNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.id)) return null;
  const position = r.position as Record<string, unknown> | undefined;
  const data = r.data as Record<string, unknown> | undefined;
  if (typeof position !== 'object' || position === null || typeof data !== 'object' || data === null) return null;
  if (!isCoordinate(position.x) || !isCoordinate(position.y)) return null;
  const contactId = data.contact_id;
  if (typeof contactId !== 'number' || !Number.isInteger(contactId) || contactId < 1) return null;
  return { id: r.id, position: { x: position.x, y: position.y }, data: { contact_id: contactId } };
}

/** Mirrors canvas.py's `_edge`: a well-shaped edge (a missing label is no label), or null. */
function parsedEdge(raw: unknown): CanvasEdge | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isId(r.id) || !isId(r.source) || !isId(r.target)) return null;
  const label = r.label === undefined || r.label === null ? '' : r.label;
  if (typeof label !== 'string') return null;
  return { id: r.id, source: r.source as string, target: r.target as string, label: label as RelationshipLabel };
}

export function stubCanvases(stub: CanvasesStub = {}) {
  const maps = (stub.maps ?? MAPS).map((m) => structuredClone(m));
  const people = stub.people ?? PEOPLE;
  const pageSize = stub.pageSize ?? 50;
  let failures = stub.failList ?? 0;
  let nextId = 700;

  const row = (m: StoredMap): CanvasRow => ({ id: m.id, name: m.name, record: m.record, people: m.nodes.length, updated_at: m.updated_at, updated_by: m.updated_by, made_by: m.made_by ?? null });
  const byNewest = (a: StoredMap, b: StoredMap) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id;

  // Unlike canvas.py, reads here do not dedupe legacy maps (stored_nodes /
  // stored_edges, first wins) or read out-of-organisation contacts as
  // removed: the fixtures are already clean, which the backend guarantees.
  function payload(m: StoredMap): Canvas {
    const people_by_contact: Record<string, MapPerson> = {};
    const hidden: string[] = [];
    const removed: string[] = [];
    for (const n of m.nodes) {
      const p = people.find((one) => one.id === n.data.contact_id);
      if (!p || p.deleted) removed.push(n.id);
      else if (!p.readable) hidden.push(n.id);
      else people_by_contact[String(p.id)] = { name: p.name, role: p.role, role_display: p.role_display, ...p.facts };
    }
    const onMap = new Set(m.nodes.map((n) => n.data.contact_id));
    const not_on_map = people
      .filter((p) => ofRecord(p, m.record) && p.readable && !p.deleted && !onMap.has(p.id))
      .map(({ id, name, role, role_display }) => ({ id, name, role, role_display }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
    const open_plans = (stub.plans ?? []).filter((plan) => sameRecord(plan.record, m.record) && isOpen(plan.status));
    return { ...row(m), version: m.version, nodes: structuredClone(m.nodes), edges: structuredClone(m.edges), people_by_contact, hidden, removed, not_on_map, open_plans, can_delete: mayDelete(m), created_by: m.created_by };
  }

  function layout(r: RecordRef): CanvasNode[] {
    const placed = people
      .filter((p) => ofRecord(p, r) && p.readable && !p.deleted)
      .sort((a, b) => {
        const rank = (p: StoredPerson) => { const i = ROW_ORDER.findIndex((g) => g.includes(p.role)); return i === -1 ? ROW_ORDER.length : i; };
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
      .slice(0, NODES_MAX);
    const nodes: CanvasNode[] = [];
    let y = 0;
    for (let group = 0; group <= ROW_ORDER.length; group++) {
      const members = placed.filter((p) => { const i = ROW_ORDER.findIndex((g) => g.includes(p.role)); return (i === -1 ? ROW_ORDER.length : i) === group; });
      for (let i = 0; i < members.length; i++) {
        if (i > 0 && i % GRID.perRow === 0) y += GRID.y;
        nodes.push({ id: `c${members[i].id}`, position: { x: (i % GRID.perRow) * GRID.x, y }, data: { contact_id: members[i].id } });
      }
      if (members.length) y += GRID.y;
    }
    return nodes;
  }

  /** Mirrors canvas.py's `clean_nodes`: checked in the backend's own order. */
  function cleanNodes(raw: unknown, record: RecordRef, keptContactIds: Set<number>): { nodes: CanvasNode[] } | { error: string } {
    if (!Array.isArray(raw)) return { error: BAD_NODE };
    if (raw.length > NODES_MAX) return { error: TOO_MANY_PEOPLE };
    const nodes: CanvasNode[] = [];
    for (const item of raw) {
      const node = parsedNode(item);
      if (!node) return { error: BAD_NODE };
      nodes.push(node);
    }
    const ids = new Set(nodes.map((n) => n.id));
    if (ids.size !== nodes.length) return { error: NODE_ID_TWICE };
    const contactIds = nodes.map((n) => n.data.contact_id);
    if (new Set(contactIds).size !== contactIds.length) return { error: CONTACT_TWICE };
    const added = contactIds.filter((id) => !keptContactIds.has(id));
    if (added.length) {
      const allowed = new Set(people.filter((p) => ofRecord(p, record) && p.readable && !p.deleted).map((p) => p.id));
      if (added.some((id) => !allowed.has(id))) return { error: SAY.PEOPLE };
    }
    return { nodes };
  }

  /** Mirrors canvas.py's `clean_edges`. */
  function cleanEdges(raw: unknown, nodeIds: Set<string>): { edges: CanvasEdge[] } | { error: string } {
    if (!Array.isArray(raw)) return { error: BAD_EDGE };
    if (raw.length > EDGES_MAX) return { error: TOO_MANY_LINES };
    const labels = new Set<string>(['', ...RELATIONSHIP_LABELS]);
    const edges: CanvasEdge[] = [];
    const edgeIds = new Set<string>();
    const links = new Set<string>();
    for (const item of raw) {
      const edge = parsedEdge(item);
      if (!edge) return { error: BAD_EDGE };
      if (!labels.has(edge.label)) return { error: BAD_LABEL };
      if (edge.source === edge.target || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return { error: EDGE_ENDS };
      if (edgeIds.has(edge.id)) return { error: EDGE_ID_TWICE };
      const link = `${edge.source}|${edge.target}|${edge.label}`;
      if (links.has(link)) return { error: EDGE_TWICE };
      edgeIds.add(edge.id);
      links.add(link);
      edges.push(edge);
    }
    return { edges };
  }

  /** The view's own order (canvas_views.py `CanvasDetailView.patch`): name,
   * then nodes (kept_contact_ids = the stored map's, hidden/removed
   * included — Contract note 7), then edges against the resulting nodes;
   * a field left out of the body keeps its stored value, and edges left out
   * drop whichever touched a node the save removed. */
  function applySave(m: StoredMap, body: Record<string, unknown>): { error: Record<string, string[]> } | { name: string; nodes: CanvasNode[]; edges: CanvasEdge[] } {
    let name = m.name;
    if ('name' in body) {
      const raw = body.name;
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (!trimmed) return { error: { name: [SAY.NAME] } };
      if (trimmed.length > NAME_MAX) return { error: { name: [NAME_TOO_LONG] } };
      name = trimmed;
    }

    let nodes = m.nodes;
    if ('nodes' in body) {
      const kept = new Set(m.nodes.map((n) => n.data.contact_id));
      const result = cleanNodes(body.nodes, m.record, kept);
      if ('error' in result) return { error: { nodes: [result.error] } };
      nodes = result.nodes;
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    let edges = m.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
    if ('edges' in body) {
      const result = cleanEdges(body.edges, nodeIds);
      if ('error' in result) return { error: { edges: [result.error] } };
      edges = result.edges;
    }

    return { name, nodes, edges };
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    const list = /^\/(?:customers\/(\d+)|accounts\/(\d+))\/canvases\/$/.exec(path);
    if (list && method === 'GET') {
      if (failures > 0) { failures -= 1; return json(500, { detail: 'Try later.' }); }
      const record = list[1] ? RECORDS.find((r) => r.kind === 'organization' && r.id === Number(list[1])) : RECORDS.find((r) => r.kind === 'account' && r.id === Number(list[2]));
      if (!record || !readableRecord(record)) return json(404, { detail: 'Not found.' });
      // Contract note 1: an organisation's list includes its accounts' maps.
      const mine = (m: StoredMap) => sameRecord(m.record, record) || (record.kind === 'organization' && record.id === PIZZA_HUT.id && m.record.id === PIZZA_EMEA.id && m.record.kind === 'account');
      return json(200, { results: maps.filter(mine).sort(byNewest).slice(0, 100).map(row) });
    }

    if (path === '/canvases/' && method === 'GET') {
      if (failures > 0) { failures -= 1; return json(500, { detail: 'Try later.' }); }
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const rows = maps.filter((m) => readableRecord(m.record) && (!q || m.name.toLowerCase().includes(q) || m.record.name.toLowerCase().includes(q))).sort(byNewest);
      const page = rows.slice(offset, offset + pageSize).map(row);
      return json(200, { results: page, next: offset + pageSize < rows.length ? String(offset + pageSize) : null });
    }

    if (path === '/canvases/' && method === 'POST') {
      // canvas_views.py `CanvasListView.post`'s own order: name, start, then
      // exactly one of customer/account.
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return json(400, { name: [SAY.NAME] });
      if (name.length > NAME_MAX) return json(400, { name: [NAME_TOO_LONG] });
      const start = body.start ?? 'people';
      if (start !== 'people' && start !== 'blank') return json(400, { start: [CHOOSE_START] });
      // Contract note 6: a non-positive or non-integer id is no id — the
      // same "choose a record" refusal as sending neither, not a 404.
      const customerId = toRecordPk(body.customer);
      const accountId = toRecordPk(body.account);
      if ((customerId === null) === (accountId === null)) return json(400, { non_field_errors: [CHOOSE_RECORD] });
      const record = customerId !== null ? RECORDS.find((r) => r.kind === 'organization' && r.id === customerId) : RECORDS.find((r) => r.kind === 'account' && r.id === accountId);
      if (!record || !readableRecord(record)) return json(404, { detail: 'Not found.' });
      const made: StoredMap = { id: nextId++, name, record, nodes: start === 'people' ? layout(record) : [], edges: [], version: 1, created_by: ME, updated_by: ME, updated_at: new Date().toISOString() };
      maps.push(made);
      return json(201, payload(made));
    }

    const one = /^\/canvases\/(\d+)\/$/.exec(path);
    const m = one ? maps.find((x) => x.id === Number(one[1]) && readableRecord(x.record)) : undefined;
    // canvas_views.py `patch`: `_version(body)` refuses a missing version
    // before the map is looked up.
    if (one && method === 'PATCH') {
      const version = body.version;
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return json(400, { version: [VERSION_NEEDED] });
    }
    if (one && !m) return json(404, { detail: 'Not found.' });
    if (m && method === 'GET') return json(200, payload(m));
    if (m && method === 'PATCH') {
      const version = body.version as number;
      // Contract note 8 / spec §1.5: a stale version is 409, checked before any field.
      if (version !== m.version) return json(409, { code: 'CANVAS_CHANGED', detail: SAY.CHANGED });
      const result = applySave(m, body);
      if ('error' in result) return json(400, result.error);
      m.name = result.name;
      m.nodes = result.nodes;
      m.edges = result.edges;
      m.version += 1;
      m.updated_by = ME;
      m.updated_at = new Date().toISOString();
      return json(200, payload(m));
    }
    if (m && method === 'DELETE') {
      if (!mayDelete(m)) return json(403, { detail: SAY.NOT_DELETER });
      maps.splice(maps.indexOf(m), 1);
      return json(204, null);
    }
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);

  /** A second editor (Dana) saves: whatever `change` does, then a new version. */
  function otherSave(id: number, change: (map: StoredMap) => void) {
    const m = maps.find((x) => x.id === id);
    if (!m) throw new Error(`No map ${id}`);
    change(m);
    m.version += 1;
    m.updated_by = DANA;
    m.updated_at = new Date().toISOString();
  }

  return { spy, maps, otherSave };
}

/** The parsed bodies of every `method` request, in order. */
export function sentBodies(spy: ReturnType<typeof vi.fn>, method: string): unknown[] {
  return spy.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

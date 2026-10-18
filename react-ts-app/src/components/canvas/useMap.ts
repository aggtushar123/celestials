import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react';
import { fetchMap, saveMap } from '../../features/canvas/canvasApi';
import {
  addPerson,
  addRelationship,
  nodeKind,
  pendingPerson,
  peopleOf,
  relabel,
  removeEdge,
  removeNode,
  sameMap,
  toFlow,
  toWrite,
  trayOf,
  type Change,
  type FlowEdge,
  type FlowNode,
  type People,
} from '../../features/canvas/canvasBoard';
import { loadError, saveRefusal, type SaveRefusal } from '../../features/canvas/canvasErrors';
import { SAY } from '../../features/canvas/canvasOptions';
import type { Canvas, NotOnMap, RelationshipLabel } from '../../features/canvas/canvasTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';

type Load = { key: string; canvas: Canvas | null; error: string | null; missing: boolean };

/** One map in the editor (spec §2.2): read, edited locally, saved whole
 *  with its `version`; a save's answer or Reload replaces the local copy.
 *  `onRefusal`, called in the same tick as the refusal itself lands (as
 *  MilestoneEditor's and TaskEditor's inline forms do), lets the caller's
 *  own `useRefusalFocus` take focus without a later effect racing the
 *  render that already shows the summary (spec §2.2: "a refusal takes
 *  focus"). */
export function useMap(id: number, onRefusal?: () => void) {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);
  const [name, setName] = useState('');
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [people, setPeople] = useState<People>({});
  const [refusal, setRefusal] = useState<SaveRefusal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Held after a success, so a second click landing after the save settled
  // but before the re-render (Save disabled, the new version in hand) sends
  // nothing; released below once the version moves. A refusal frees it.
  const { busy, run, release } = useSubmitOnce({ holdOnSuccess: true });

  const adopt = useCallback((canvas: Canvas, at: string) => {
    const flow = toFlow(canvas);
    setLoad({ key: at, canvas, error: null, missing: false });
    setName(canvas.name);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setPeople(peopleOf(canvas));
    setRefusal(null);
    setNotice(null);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMap(id).then(
      (canvas) => alive && adopt(canvas, key),
      (err: unknown) => {
        if (!alive) return;
        const { missing, message } = loadError(err);
        setLoad({ key, canvas: null, error: message, missing });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key, adopt]);

  const canvas = load?.canvas ?? null;
  const version = canvas?.version;
  useEffect(() => release(), [version, release]);
  const hidden = useMemo(() => new Set(canvas?.hidden ?? []), [canvas]);
  const saved = useMemo(() => (canvas ? toWrite(toFlow(canvas).nodes, toFlow(canvas).edges) : null), [canvas]);
  const dirty = canvas !== null && saved !== null && (name !== canvas.name || !sameMap(toWrite(nodes, edges), saved));
  const tray = useMemo(() => (canvas ? trayOf(canvas, nodes, people) : []), [canvas, nodes, people]);

  /** Applies a board edit, or shows why not (Decision 14). */
  function apply<T>(change: Change<T>, set: (value: T) => void) {
    if (change.ok) {
      set(change.value);
      setNotice(null);
    } else setNotice(change.refused);
  }

  const nameOf = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return SAY.REMOVED;
    const kind = nodeKind(node, hidden, people);
    return kind === 'person' ? people[String(node.data.contact_id)].name : kind === 'hidden' ? SAY.HIDDEN : SAY.REMOVED;
  };

  async function save() {
    if (!canvas) return;
    // Always the whole map, nodes and edges together (Contract notes 7-8).
    const outcome = await run(() => saveMap(id, { name, ...toWrite(nodes, edges), version: canvas.version }));
    if (!outcome) return;
    if (outcome.ok) adopt(outcome.value, key);
    else {
      setRefusal(saveRefusal(outcome.error));
      onRefusal?.();
    }
  }

  return {
    canvas,
    error: load?.key === key ? load.error : null,
    missing: load?.key === key ? load.missing : false,
    name,
    setName,
    nodes,
    edges,
    people,
    hidden,
    tray,
    dirty,
    saving: busy,
    refusal,
    notice,
    nameOf,
    onNodesChange: (changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    // Hidden people's handles take no lines; this holds even if a drag lands anyway.
    connect: (c: Connection) => {
      if (hidden.has(c.source) || hidden.has(c.target)) return;
      apply(addRelationship(edges, c.source, c.target, ''), setEdges);
    },
    addFromTray: (person: NotOnMap) =>
      apply(addPerson(nodes, person), (next) => {
        setNodes(next);
        setPeople((current) => (current[String(person.id)] ? current : { ...current, [String(person.id)]: pendingPerson(person) }));
      }),
    removePerson: (nodeId: string) => {
      const next = removeNode(nodes, edges, nodeId);
      setNodes(next.nodes);
      setEdges(next.edges);
      setNotice(null);
    },
    link: (source: string, target: string, label: RelationshipLabel) => apply(addRelationship(edges, source, target, label), setEdges),
    relabelLine: (lineId: string, label: RelationshipLabel) => apply(relabel(edges, lineId, label), setEdges),
    removeLine: (lineId: string) => setEdges((current) => removeEdge(current, lineId)),
    save,
    reload: () => setAttempt((n) => n + 1),
  };
}

export type MapApi = ReturnType<typeof useMap>;

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  addEdge,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { Connection, Edge, Node, OnNodesChange, OnEdgesChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Lock, LockOpen, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { ICON_BUTTON, LoadingState, OVERLAY, TYPE } from '../../components/ui';

import { EntryNode, OperatorNode, ActionNode } from './CustomNodes';
import { CustomEdge } from './CustomEdge';
import { BuilderSidebar } from './BuilderSidebar';
import { ScenarioHeader } from './ScenarioHeader';
import { EditNodePane } from './EditNodePane';
import { RunNowModal } from './RunNowModal';
import { createScenario, fetchScenario, runScenario, updateScenario } from './scenarioApi';
import { ApiError } from '../../lib/apiClient';
import type { ScenarioNodeDetail, ScenarioNodeData, ApplyToTarget } from './types';

// See revenact-backend's services/scenarios/engine.py for exactly what
// "wired up with backend" means here: real CRUD persistence (this
// component's own load/persist below) plus a real, deliberately
// limited execution engine (RunNowModal / ScenarioHeader's Run Now
// button) — Send Email/Create Task/Set Attribute/Churn Entity/
// Condition/Filter actually do the real-world thing they say. Every
// other per-node-type edit panel (Assign Playbook/Slack Message/
// Create Pipeline/MS Teams/Send Survey — see EditNodePane.tsx) is
// still an illustrative mockup, on both sides, for the same reason as
// before: no real Playbook/Slack/Teams/Survey concept exists anywhere
// in this codebase. The canvas itself (drag/connect/delete nodes and
// edges — CustomNodes.tsx/CustomEdge.tsx) and node label editing are
// unrelated to any of that and were already real.

const nodeTypes = {
  entry: EntryNode,
  operator: OperatorNode,
  action: ActionNode,
};

const edgeTypes = {
  interactive: CustomEdge,
};

let idIncrement = 10;
const getId = () => `node_${idIncrement++}`;

interface FlowProps {
  nodes: Node<ScenarioNodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node<ScenarioNodeData>>;
  onEdgesChange: OnEdgesChange<Edge>;
  setNodes: React.Dispatch<React.SetStateAction<Node<ScenarioNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
}

function Flow({ nodes, edges, onNodesChange, onEdgesChange, setNodes, setEdges }: FlowProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [editingNode, setEditingNode] = useState<ScenarioNodeDetail | null>(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

  // Listen for edit events from custom nodes
  useEffect(() => {
    const handleEdit = (event: Event) => {
      const customEvent = event as CustomEvent<ScenarioNodeDetail>;
      if (customEvent.detail) {
        setEditingNode(customEvent.detail);
      }
    };
    window.addEventListener('edit-node', handleEdit);
    return () => window.removeEventListener('edit-node', handleEdit);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'interactive' }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow/label');

      // check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node<ScenarioNodeData> = {
        id: getId(),
        type,
        position,
        data: { label: `New ${label}`, action: label },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes],
  );

  // Merges the pane's own saved fields onto the node's existing data
  // (see EditNodePane's own docstring on which fields those are)
  // rather than replacing it wholesale — anything the pane doesn't
  // collect (e.g. `action`, set once at creation) survives untouched.
  const handleSaveNode = (updates: Partial<ScenarioNodeData>) => {
    if (!editingNode) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, ...updates } } : n))
    );
    setEditingNode(null);
  };

  return (
    <div className="flex-1 h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        nodesDraggable={!isLocked}
        nodesConnectable={!isLocked}
        elementsSelectable={!isLocked}
        panOnDrag={!isLocked}
        zoomOnScroll={!isLocked}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-strong)" />

        <Panel position="top-right" className={`mr-4 mt-4 flex gap-1 p-1 ${OVERLAY}`}>
          <button type="button" onClick={() => zoomIn()} aria-label="Zoom in" className={ICON_BUTTON}>
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomOut()} aria-label="Zoom out" className={ICON_BUTTON}>
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => fitView({ duration: 400 })} aria-label="Fit the canvas" className={ICON_BUTTON}>
            <Maximize className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsLocked(!isLocked)}
            aria-label={isLocked ? 'Unlock the canvas' : 'Lock the canvas'}
            aria-pressed={isLocked}
            className={`${ICON_BUTTON} ${isLocked ? 'bg-subtle text-ink' : ''}`.trim()}
          >
            {isLocked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <LockOpen className="h-4 w-4" aria-hidden="true" />}
          </button>
        </Panel>
      </ReactFlow>

      {/* Edit Pane */}
      <EditNodePane
        isOpen={!!editingNode}
        node={editingNode}
        onClose={() => setEditingNode(null)}
        onSave={handleSaveNode}
      />
    </div>
  );
}

export function CreateScenario() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  // undefined until the first successful save — see persist() below,
  // which POSTs while this is undefined and PATCHes once it's a real id.
  const [scenarioId, setScenarioId] = useState<number | undefined>(
    routeId ? Number(routeId) : undefined
  );
  const [name, setName] = useState('Untitled Scenario');
  const [applyTo, setApplyTo] = useState<ApplyToTarget>('organizations');
  const [isActive, setIsActive] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!routeId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ScenarioNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Loads the existing scenario, if any — a fresh /scenarios/create
  // visit has no routeId, so this is a no-op and the state above's own
  // defaults (blank graph, "Untitled Scenario") stand. Runs once: a
  // real navigation to a *different* scenario remounts this page
  // entirely (the route param is part of React Router's own key), so
  // there's no "routeId changed under us" case to react to.
  useEffect(() => {
    if (!routeId) return;

    async function load() {
      try {
        const existing = await fetchScenario(routeId!);
        setName(existing.name);
        setApplyTo(existing.apply_to);
        setIsActive(existing.is_active);
        setNodes(existing.nodes);
        setEdges(existing.edges);
        setLastSavedAt(existing.updated_at);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this scenario.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persist() {
    setSaveError(null);
    const payload = {
      name: name.trim() || 'Untitled Scenario',
      apply_to: applyTo,
      nodes,
      edges,
      is_active: isActive,
    };
    try {
      const saved = scenarioId
        ? await updateScenario(scenarioId, payload)
        : await createScenario(payload);
      if (!scenarioId) {
        setScenarioId(saved.id);
        // Swaps /scenarios/create for /scenarios/<id> without a remount
        // (`replace` — no "back" stop on the create URL) so a further
        // Save PATCHes this same row instead of creating a duplicate.
        navigate(`/scenarios/${saved.id}`, { replace: true });
      }
      setLastSavedAt(saved.updated_at);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save this scenario.');
    }
  }

  async function handleSaveAndClose() {
    await persist();
    navigate('/scenarios');
  }

  const canRun = applyTo === 'organizations' && scenarioId !== undefined;

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-base">
        <LoadingState label="Loading the scenario" variant="block" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="flex h-full w-full items-center justify-center bg-base text-[13px] leading-5 text-danger-ink">
        {loadError}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-base overflow-hidden">
      <ScenarioHeader
        name={name}
        onNameChange={setName}
        applyTo={applyTo}
        onApplyToChange={setApplyTo}
        isActive={isActive}
        onIsActiveChange={setIsActive}
        canRun={canRun}
        onRunNowClick={() => setIsRunModalOpen(true)}
        onSave={persist}
        onSaveAndClose={handleSaveAndClose}
        lastSavedAt={lastSavedAt}
      />

      {saveError && (
        <div role="alert" className="shrink-0 border-b border-line-subtle bg-danger-dim px-4 py-2 text-[13px] leading-5 text-danger-ink">
          {saveError}
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center md:hidden">
        <p className={TYPE.title}>Edit scenarios on a larger screen.</p>
        <p className={`max-w-[48ch] ${TYPE.bodyMuted}`}>The builder needs room for its palette and canvas. Open this scenario on a tablet or a computer.</p>
      </div>

      <div data-part="builder" className="hidden flex-1 overflow-hidden md:flex">
        <BuilderSidebar />

        <div className="flex-1 overflow-hidden relative">
          <ReactFlowProvider>
            <Flow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              setNodes={setNodes}
              setEdges={setEdges}
            />
          </ReactFlowProvider>
        </div>
      </div>

      {isRunModalOpen && scenarioId !== undefined && (
        <RunNowModal
          onRun={(customerId) => runScenario(scenarioId, customerId)}
          onClose={() => setIsRunModalOpen(false)}
        />
      )}
    </div>
  );
}

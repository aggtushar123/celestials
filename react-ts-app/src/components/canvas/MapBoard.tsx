import { useRef } from 'react';
import { Background, BackgroundVariant, ConnectionMode, Panel, ReactFlow, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import type { FlowEdge, FlowNode } from '../../features/canvas/canvasBoard';
import { FOCUS, ICON_BUTTON, OVERLAY } from '../ui';
import { PersonNode } from './PersonNode';
import { RelationshipEdge } from './RelationshipEdge';
import type { MapApi } from './useMap';

const nodeTypes = { person: PersonNode };
const edgeTypes = { relationship: RelationshipEdge };
/** dataTransfer type for a tray person dragged onto the board. */
export const PERSON_DRAG = 'application/x-revenact-person';

function Zoom() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  // No motion timing: keyboard-driven changes never animate (spec §2.2).
  return (
    <Panel position="bottom-right" className={`flex gap-1 p-1 ${OVERLAY}`}>
      <button type="button" onClick={() => zoomIn()} aria-label="Zoom in" className={ICON_BUTTON}>
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => zoomOut()} aria-label="Zoom out" className={ICON_BUTTON}>
        <ZoomOut className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => fitView()} aria-label="Fit the map" className={ICON_BUTTON}>
        <Maximize className="h-4 w-4" aria-hidden="true" />
      </button>
    </Panel>
  );
}

/** The board (spec §2.2). Read-only boards pan and zoom only. */
export function MapBoard({
  map,
  editable,
  onOpen,
  bare = false,
}: {
  map: MapApi;
  editable: boolean;
  onOpen: (nodeId: string) => void;
  /** Inside the editor's own frame: no border or radius here. */
  bare?: boolean;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={boardRef}
      data-part="board"
      aria-label="Map board"
      role="region"
      tabIndex={-1}
      className={`relative h-[min(70dvh,720px)] min-h-[420px] w-full min-w-0 flex-1 overflow-hidden ${bare ? '' : 'rounded-xl border border-line'} bg-base ${FOCUS}`}
      onDragOver={(event) => {
        if (editable && event.dataTransfer.types.includes(PERSON_DRAG)) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData(PERSON_DRAG);
        const person = map.tray.find((p) => String(p.id) === raw);
        if (!editable || !person) return;
        event.preventDefault();
        map.addFromTray(person);
      }}
    >
      <ReactFlowProvider>
        <ReactFlow<FlowNode, FlowEdge>
          nodes={map.nodes}
          edges={map.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={map.onNodesChange}
          onEdgesChange={map.onEdgesChange}
          onConnect={map.connect}
          // A card removed with Delete took focus with it: keep it on the board.
          onNodesDelete={() => boardRef.current?.focus()}
          connectionMode={ConnectionMode.Loose}
          onNodeClick={(_, node) => onOpen(node.id)}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={editable}
          edgesFocusable={editable}
          deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
          minZoom={0.3}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-strong)" />
          <Zoom />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

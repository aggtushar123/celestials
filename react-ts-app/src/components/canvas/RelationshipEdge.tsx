import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, useStore, type EdgeProps, type InternalNode } from '@xyflow/react';
import type { FlowEdge, FlowNode } from '../../features/canvas/canvasBoard';
import { bowOffset, floatingEnds, labelShift, type Box, type Side } from '../../features/canvas/edgeGeometry';
import { relationshipText } from '../../features/canvas/canvasText';
import { EdgeLabelMenu } from './EdgeLabelMenu';
import { useMapContext } from './MapContext';

/** Labels sit above every card: lines meet the facing sides, so a label in
 *  the gap between two close cards would otherwise be clipped by them. React
 *  Flow lifts a selected card to z-index 1000; nothing in the viewport
 *  (labels, nodes) makes its own stacking context, so this outranks it. */
const LABEL_Z = 1001;

const SIDE: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };

function boxOf(node: InternalNode<FlowNode> | undefined): Box | null {
  const width = node?.measured.width;
  const height = node?.measured.height;
  if (!node || !width || !height) return null;
  return { ...node.internals.positionAbsolute, width, height };
}

/** A line (spec §2.2): one neutral stroke (Decision 7); its label's words
 *  carry the meaning, picked from a small menu. It runs between the sides of
 *  its two cards that face each other; lines sharing a pair bow apart. */
export const RelationshipEdge = memo(function RelationshipEdge(props: EdgeProps<FlowEdge>) {
  const map = useMapContext();
  const source = boxOf(useInternalNode<FlowNode>(props.source));
  const target = boxOf(useInternalNode<FlowNode>(props.target));
  // A number, so a line re-renders only when its own offset changes.
  const offset = useStore((state) => bowOffset(props, state.edges));
  let path: string;
  let labelX: number;
  let labelY: number;
  if (source && target) {
    const ends = floatingEnds(source, target, offset);
    const shift = labelShift(source, target, offset);
    const [d, x, y] = getBezierPath({
      sourceX: ends.sx,
      sourceY: ends.sy,
      sourcePosition: SIDE[ends.sourcePosition],
      targetX: ends.tx,
      targetY: ends.ty,
      targetPosition: SIDE[ends.targetPosition],
    });
    [path, labelX, labelY] = [d, x + shift.dx, y + shift.dy];
  } else {
    // Not measured yet: React Flow's own handle positions.
    [path, labelX, labelY] = getBezierPath(props);
  }
  const label = props.data?.label ?? '';
  const sentence = relationshipText(map.nameOf(props.source), label, map.nameOf(props.target));
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={{ stroke: 'var(--border-strong)', strokeWidth: props.selected ? 3 : 2 }} />
      <EdgeLabelRenderer>
        <div className="nodrag nopan absolute" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all', zIndex: LABEL_Z }}>
          <EdgeLabelMenu
            label={label}
            sentence={sentence}
            editable={map.editable}
            selected={Boolean(props.selected)}
            onPick={(next) => map.relabelLine(props.id, next)}
            onRemove={() => map.removeLine(props.id)}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

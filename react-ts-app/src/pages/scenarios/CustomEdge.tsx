import React, { memo } from 'react';
import {
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  type EdgeProps,
  useReactFlow,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { BUTTON, ICON_BUTTON } from '../../components/ui';

export const CustomEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
}: EdgeProps) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onToggleLabel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === id) {
          const currentLabel = edge.label;
          let nextLabel: string | undefined = undefined;
          
          if (!currentLabel) nextLabel = 'Yes';
          else if (currentLabel === 'Yes') nextLabel = 'No';
          else if (currentLabel === 'No') nextLabel = undefined;
          
          return { ...edge, label: nextLabel };
        }
        return edge;
      })
    );
  };

  const onRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((eds) => eds.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 2, stroke: 'var(--border-strong)' }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan group flex items-center gap-1"
        >
          <button
            type="button"
            onClick={onToggleLabel}
            aria-label={label ? `Branch label ${label}, change it` : 'Set a branch label'}
            className={`${BUTTON} px-2 ${label ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'}`}
          >
            {label || 'Set label'}
          </button>

          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove the connection"
            className={`${ICON_BUTTON} border border-line bg-surface opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

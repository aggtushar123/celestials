import { memo } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import { Card } from '../ui';
import { nodeKind, type FlowNode } from '../../features/canvas/canvasBoard';
import { useMapContext } from './MapContext';
import { NodeMenu } from './NodeMenu';
import { PersonCard } from './PersonCard';

const HANDLE = '!h-3 !w-3 !border-2 !border-line-strong !bg-surface';
/** Handles stay invisible (still there to drag from) until the card is
 *  hovered or holds focus, or while a line is being drawn. Tabbing to a card
 *  focuses React Flow's node wrapper (`aria-roledescription="node"`), which
 *  sits outside the card's group, so that counts too. They appear at once:
 *  the board never animates. */
const HIDDEN_HANDLE = `${HANDLE} !opacity-0 group-hover:!opacity-100 group-focus-within:!opacity-100 in-[[aria-roledescription=node]:focus-visible]:!opacity-100`;
/** Drag handles on all four sides. The board connects loosely (any handle to
 *  any handle), and a line draws from the sides its cards face, not from a
 *  handle, so saved lines carry no handle and load as they always have. */
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

/** A person on the board (spec §2.2). Drag handles on every side; the ⋯
 *  menu (44px) does everything a drag does. Hidden people have no menu. */
export const PersonNode = memo(function PersonNode({ id, data, selected }: NodeProps<FlowNode>) {
  const map = useMapContext();
  const drawing = useConnection((connection) => connection.inProgress);
  const kind = nodeKind({ id, data, position: { x: 0, y: 0 }, type: 'person' }, map.hidden, map.people);
  const person = map.people[String(data.contact_id)] ?? null;
  // A line may never be dragged to or from a hidden person: Add a
  // relationship leaves them out too (Decision 8).
  const connectable = map.editable && kind !== 'hidden';
  const menu = map.editable && kind !== 'hidden' ? <NodeMenu nodeId={id} kind={kind} name={map.nameOf(id)} /> : null;
  return (
    <div data-node={id} data-kind={kind} className={`group w-52 rounded-xl ${selected ? 'outline outline-2 outline-accent' : ''}`.trim()}>
      <Card as="div" pad="none">
        <PersonCard kind={kind} person={person} menu={menu} />
      </Card>
      {SIDES.map((side) => (
        <Handle key={side} id={side} type="source" position={side} className={drawing ? HANDLE : HIDDEN_HANDLE} isConnectable={connectable} />
      ))}
    </div>
  );
});

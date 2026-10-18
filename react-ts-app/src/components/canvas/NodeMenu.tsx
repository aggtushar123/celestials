import type { KeyboardEvent, MouseEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { NodeKind } from '../../features/canvas/canvasBoard';
import { Menu, type MenuItem } from '../ui/Menu';
import { FOCUS } from '../organizations/portfolio/styles';
import { BOARD, useMapContext } from './MapContext';

/** 44px at every width (spec §2.4); `nodrag nopan` so React Flow leaves it alone. */
const TRIGGER = `nodrag nopan inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink ${FOCUS}`;

/** A node's ⋯ menu: every edit without dragging (spec §2.2). Clicks and keys
 *  stop here, so the node is not selected or moved by them (React events
 *  bubble through the portal along the component tree). The menu renders in
 *  a portal, so the board's clipped edge never cuts it off. */
export function NodeMenu({ nodeId, kind, name }: { nodeId: string; kind: NodeKind; name: string }) {
  const map = useMapContext();
  const remove: MenuItem = {
    key: 'remove',
    label: 'Remove from map',
    onSelect: () => {
      // The menu has just focused its button, which leaves with the card:
      // hand focus to the board first, so it never drops to the page.
      const board = document.activeElement?.closest<HTMLElement>(BOARD);
      board?.focus();
      map.removePerson(nodeId);
    },
    danger: true,
  };
  const items: MenuItem[] =
    kind === 'person'
      ? [
          { key: 'open', label: 'Open person', onSelect: () => map.openPerson(nodeId) },
          { key: 'relate', label: 'Add a relationship to…', onSelect: () => map.askRelationship(nodeId) },
          remove,
        ]
      : [remove];
  // Every key stops here, Escape included: React Flow would read it as
  // selecting the card. The portalled menu closes on Escape by itself.
  const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();
  return (
    <span className="nodrag nopan" onClick={stop} onKeyDown={stop}>
      <Menu label={`Actions for ${name}`} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />} triggerClassName={TRIGGER} items={items} portal />
    </span>
  );
}

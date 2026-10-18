import { createContext, useContext } from 'react';
import type { People } from '../../features/canvas/canvasBoard';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';

/** What a node or a line on the board may read and do. React Flow node data
 *  holds only `contact_id` (spec §0), so the rest travels here. */
export interface MapContextValue {
  editable: boolean;
  people: People;
  hidden: ReadonlySet<string>;
  nameOf: (nodeId: string) => string;
  openPerson: (nodeId: string) => void;
  askRelationship: (nodeId: string) => void;
  removePerson: (nodeId: string) => void;
  relabelLine: (id: string, label: RelationshipLabel) => void;
  removeLine: (id: string) => void;
}

/** The board's own element (MapBoard): focus lands here when a card it held leaves. */
export const BOARD = '[data-part="board"]';

export const MapContext = createContext<MapContextValue | null>(null);

export function useMapContext(): MapContextValue {
  const value = useContext(MapContext);
  if (!value) throw new Error('useMapContext needs a MapContext provider');
  return value;
}

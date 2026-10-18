import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { SAY } from '../../features/canvas/canvasOptions';
import { FOCUS, NUM, TYPE } from '../ui';
import { PERSON_DRAG } from './MapBoard';
import type { MapApi } from './useMap';

const ROW = `flex min-h-11 sm:min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-subtle ${FOCUS}`;

/** "Not on the map" (spec §2.2): collapsible; click or drag a person to add
 *  them at the next free grid spot (Decision 9). */
export function NotOnMapTray({ map }: { map: MapApi }) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const listId = useId();
  return (
    <section role="region" aria-labelledby={headingId} className={`flex ${open ? 'w-60' : ''} shrink-0 flex-col gap-1 border-r border-line-subtle bg-surface p-2`}>
      <h2 id={headingId} className="sr-only">{SAY.NOT_ON_MAP}</h2>
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)} className={`${ROW} ${TYPE.body} font-semibold`}>
        {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        {SAY.NOT_ON_MAP} <span className={NUM}>{map.tray.length}</span>
      </button>
      {open ? (
        map.tray.length === 0 ? (
          <p id={listId} className={`px-2 ${TYPE.bodyMuted}`}>Everyone is on the map.</p>
        ) : (
          <ul id={listId} className="flex flex-col">
            {map.tray.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PERSON_DRAG, String(person.id));
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => map.addFromTray(person)}
                  aria-label={`Add ${person.name} to the map`}
                  className={ROW}
                >
                  <Plus className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${TYPE.body}`}>{person.name}</span>
                    <span className={`block truncate ${TYPE.meta}`}>{person.role_display}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

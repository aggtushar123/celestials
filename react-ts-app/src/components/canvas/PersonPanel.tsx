import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { edgesOf } from '../../features/canvas/canvasBoard';
import { LABEL_CHOICES } from '../../features/canvas/canvasOptions';
import { labelText, relationshipText } from '../../features/canvas/canvasText';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';
import { BUTTON, ICON_BUTTON, Select, TYPE } from '../ui';
import { PersonFactsList } from './facts';
import type { MapApi } from './useMap';


/** A person's facts beside the board (spec §2.2, Decision 13), with every
 *  line touching them as a sentence to relabel or remove. */
export function PersonPanel({ map, nodeId, onClose }: { map: MapApi; nodeId: string; onClose: () => void }) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Opening a person (or another one) notes what opened them (the ⋯ button)
  // and moves focus to their name. Focus already inside the panel is not an
  // opener, so the latest card outside it is the one remembered.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !asideRef.current?.contains(active)) openerRef.current = active;
    headingRef.current?.focus();
  }, [nodeId]);
  // Focus returns to the latest opener when the panel closes.
  useEffect(
    () => () => {
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    },
    [],
  );
  const node = map.nodes.find((n) => n.id === nodeId);
  const person = node ? map.people[String(node.data.contact_id)] : undefined;
  if (!node || !person) return null;
  const lines = edgesOf(map.edges, nodeId);
  return (
    <aside
      ref={asideRef}
      aria-label={person.name}
      className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line-subtle bg-surface p-4 max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:shadow-lg"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={`truncate ${TYPE.title}`}>{person.name}</h2>
          <p className={TYPE.bodyMuted}>{person.role_display}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <PersonFactsList person={person} />
      <Link to={`/contacts/${node.data.contact_id}`} className={BUTTON}>Open contact</Link>
      <h3 className={TYPE.label}>Relationships</h3>
      {lines.length === 0 ? (
        <p className={TYPE.bodyMuted}>No relationships yet.</p>
      ) : (
        <ul aria-label="Relationships" className="flex flex-col divide-y divide-line-subtle">
          {lines.map((line) => {
            const label = line.data?.label ?? '';
            const sentence = relationshipText(map.nameOf(line.source), label, map.nameOf(line.target));
            return (
              <li key={line.id} className="flex flex-col gap-1 py-2">
                <span className={TYPE.body}>{sentence}</span>
                <span className="flex items-center gap-1">
                  <span className="min-w-0 flex-1">
                    <Select
                      label={`Relationship: ${sentence}`}
                      labelPosition="hidden"
                      value={label}
                      onChange={(next) => map.relabelLine(line.id, next as RelationshipLabel)}
                      options={LABEL_CHOICES.map((choice) => ({ value: choice, label: labelText(choice) }))}
                    />
                  </span>
                  <button type="button" onClick={() => map.removeLine(line.id)} aria-label={`Remove the line: ${sentence}`} className={ICON_BUTTON}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

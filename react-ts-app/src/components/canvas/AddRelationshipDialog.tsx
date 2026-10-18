import { useId, useState, type FormEvent } from 'react';
import { nodeKind } from '../../features/canvas/canvasBoard';
import { LABEL_CHOICES } from '../../features/canvas/canvasOptions';
import { labelText, relationshipText } from '../../features/canvas/canvasText';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';
import { PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { BuilderDialog } from '../segments/BuilderDialog';
import type { MapApi } from './useMap';


/** Add a relationship to… (spec §2.2, Decision 8): pick a person, then a label. */
export function AddRelationshipDialog({ map, sourceId, onClose }: { map: MapApi; sourceId: string; onClose: () => void }) {
  const personId = useId();
  const labelId = useId();
  const others = map.nodes.filter((n) => n.id !== sourceId && nodeKind(n, map.hidden, map.people) === 'person');
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const [label, setLabel] = useState<RelationshipLabel>('Reports to');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    map.link(sourceId, target, label);
    onClose();
  }

  return (
    <BuilderDialog title="Add a relationship" size="narrow" onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={personId} className="text-[13px] font-semibold text-ink">Person</label>
            <select id={personId} value={target} onChange={(e) => setTarget(e.target.value)} className={`${INPUT} border-line`}>
              {others.map((n) => (
                <option key={n.id} value={n.id}>{map.nameOf(n.id)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={labelId} className="text-[13px] font-semibold text-ink">Relationship</label>
            <select id={labelId} value={label} onChange={(e) => setLabel(e.target.value as RelationshipLabel)} className={`${INPUT} border-line`}>
              {LABEL_CHOICES.map((option) => (
                <option key={option || 'none'} value={option}>{labelText(option)}</option>
              ))}
            </select>
          </div>
          {target ? <p className="text-[13px] text-ink-muted">{relationshipText(map.nameOf(sourceId), label, map.nameOf(target))}</p> : <p className="text-[13px] text-ink-muted">Add someone else to the map first.</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line-subtle p-4">
          <button type="button" onClick={onClose} className={QUIET}>Cancel</button>
          <button type="submit" disabled={!target} className={PRIMARY}>Add</button>
        </footer>
      </form>
    </BuilderDialog>
  );
}

import { X } from 'lucide-react';
import { LABEL_CHOICES } from '../../features/canvas/canvasOptions';
import { labelText } from '../../features/canvas/canvasText';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';
import { Menu, type MenuItem } from '../ui/Menu';
import { FOCUS } from '../ui';

const PILL = `inline-flex min-h-11 sm:min-h-9 items-center rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-ink hover:bg-subtle ${FOCUS}`;
const REMOVE = `inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-muted hover:text-danger-ink ${FOCUS}`;

/** A line's label (spec §2.2): a small menu of the four labels and No label;
 *  Remove on a selected line. Read-only, just the words. */
export function EdgeLabelMenu({
  label,
  sentence,
  editable,
  selected,
  onPick,
  onRemove,
}: {
  label: RelationshipLabel;
  sentence: string;
  editable: boolean;
  selected: boolean;
  onPick: (label: RelationshipLabel) => void;
  onRemove: () => void;
}) {
  if (!editable) {
    return label ? <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink">{label}</span> : null;
  }
  const items: MenuItem[] = LABEL_CHOICES.map((option) => ({ key: option || 'none', label: labelText(option), onSelect: () => onPick(option) }));
  return (
    <span className="flex items-center gap-1">
      <Menu label={`Relationship: ${labelText(label)}. ${sentence}`} trigger={labelText(label)} triggerClassName={PILL} items={items} align="start" portal />
      {selected ? (
        <button type="button" onClick={onRemove} aria-label={`Remove the line: ${sentence}`} className={REMOVE}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

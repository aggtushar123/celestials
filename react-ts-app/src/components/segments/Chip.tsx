import { X } from 'lucide-react';
import { FOCUS } from '../ui';

/** A chosen value with its Remove button (a record, an owner, a product).
 *  `hidden` is a record the reader can't open: named only as such, and never
 *  editable into a name, only removable. */
export function Chip({ name, hidden = false, onRemove }: { name: string; hidden?: boolean; onRemove: () => void }) {
  return (
    <li className="inline-flex items-center gap-0.5 rounded-full bg-subtle pl-2.5 text-[13px] text-ink">
      {hidden ? <em className="text-ink-muted">{name}</em> : name}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-line-subtle hover:text-ink sm:h-7 sm:w-7 ${FOCUS}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}

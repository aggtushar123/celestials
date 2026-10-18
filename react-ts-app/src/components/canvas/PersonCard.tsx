import type { ReactNode } from 'react';
import { EyeOff, UserX } from 'lucide-react';
import type { NodeKind } from '../../features/canvas/canvasBoard';
import { SAY } from '../../features/canvas/canvasOptions';
import type { PersonFacts } from '../../features/canvas/canvasTypes';
import { PersonFactsList } from './facts';

/** A node's body (spec §2.2): a person with their facts; someone the reader
 *  can't open, with no details; or a removed contact. `menu` is the ⋯ menu. */
export function PersonCard({ kind, person, menu }: { kind: NodeKind; person: PersonFacts | null; menu: ReactNode }) {
  if (kind !== 'person' || !person) {
    const Icon = kind === 'hidden' ? EyeOff : UserX;
    return (
      <div className="flex items-center gap-2 p-3">
        <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-muted">{kind === 'hidden' ? SAY.HIDDEN : SAY.REMOVED}</span>
        {menu}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{person.name}</p>
          <p className="truncate text-[11px] text-ink-muted">{person.role_display}</p>
        </div>
        {menu}
      </div>
      <PersonFactsList person={person} />
    </div>
  );
}

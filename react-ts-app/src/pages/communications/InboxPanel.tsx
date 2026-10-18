// The inbox's own left panel: the queue folders and two filters.
//
// Folders are the four kinds of waiting the queue is built from, plus
// everything. Filters are the shared switch (UI foundations spec §5.5) over
// real server parameters: "Needs you" is the queue versus the whole stream,
// "Mine only" is whose accounts.

import { useId } from 'react';
import { AtSign, Inbox, LifeBuoy, Mail, Phone } from 'lucide-react';
import { FOCUS, NUM, Switch, TYPE } from '../../components/ui';
import type { CommunicationKind, CommunicationsStats, TileKind } from '../../features/communications/communicationsSlice';

const FOLDERS: { kind: TileKind | null; label: string; icon: typeof Inbox }[] = [
  { kind: null, label: 'Inbox', icon: Inbox },
  { kind: 'question', label: 'Questions for you', icon: AtSign },
  { kind: 'email', label: 'Replies owed', icon: Mail },
  { kind: 'ticket', label: 'Open tickets', icon: LifeBuoy },
  { kind: 'call', label: 'Calls to wrap up', icon: Phone },
];

/** A folder in the inbox's own panel, flat inside the glass shell (UI
 *  foundations spec §4.1): no box, the current one on the subtle fill. The
 *  mailbox's panel uses the same. No text colour here: ON and OFF add it. */
export const FOLDER = `flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] leading-5 sm:min-h-9 ${FOCUS}`;
export const FOLDER_ON = 'bg-subtle font-semibold text-ink';
export const FOLDER_OFF = 'text-ink-muted hover:bg-subtle hover:text-ink';

export function InboxPanel({
  kind,
  stats,
  needsOnly,
  mineOnly,
  hasMailbox,
  onKind,
  onNeedsOnly,
  onMineOnly,
}: {
  kind: CommunicationKind | null;
  stats: CommunicationsStats | null;
  needsOnly: boolean;
  mineOnly: boolean;
  hasMailbox: boolean;
  onKind: (kind: CommunicationKind | null) => void;
  onNeedsOnly: (next: boolean) => void;
  onMineOnly: (next: boolean) => void;
}) {
  const filtersId = useId();
  return (
    <aside aria-label="Inbox folders and filters" className="flex w-[232px] shrink-0 flex-col gap-4 border-r border-line-subtle pr-3">
      <nav aria-label="Folders" className="flex flex-col gap-0.5">
        {FOLDERS.map(({ kind: folderKind, label, icon: Icon }) => {
          const active = folderKind === kind;
          const count = folderKind === null ? stats?.total : stats?.counts[folderKind];
          const dash = folderKind === 'email' && stats !== null && !hasMailbox;
          return (
            <button key={label} type="button" onClick={() => onKind(folderKind)} aria-current={active ? 'page' : undefined} className={`${FOLDER} ${active ? FOLDER_ON : FOLDER_OFF}`}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">{label}</span>
              <span className={`${TYPE.meta} ${NUM}`}>
                {stats === null ? '' : dash ? '–' : count}
              </span>
            </button>
          );
        })}
      </nav>
      <section aria-labelledby={filtersId} className="flex flex-col gap-1">
        <h3 id={filtersId} className={`px-3 ${TYPE.label}`}>
          Filters
        </h3>
        <Switch checked={needsOnly} onChange={onNeedsOnly} className="self-start">
          Needs you
        </Switch>
        <Switch checked={mineOnly} onChange={onMineOnly} className="self-start">
          Mine only
        </Switch>
      </section>
    </aside>
  );
}

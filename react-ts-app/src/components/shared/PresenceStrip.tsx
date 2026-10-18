import { EntityAvatar } from './EntityAvatar';
import type { SessionParticipant } from '../../features/copilotSessions/types';

export interface PresenceStripProps {
  participants: SessionParticipant[];
  /** Caps how many avatars render before collapsing the rest into a "+N"
   * chip — no existing avatar-stack component in this codebase to match,
   * so this is a new, small, self-contained one (see EntityAvatar's own
   * docstring for the underlying single-avatar rendering it wraps). */
  max?: number;
}

// A live session's own "who's watching" indicator — see the Multiplayer
// Copilot plan's own "no dark patterns" requirement: the requester always
// sees this exact same strip the viewer does, never a one-sided view.
export function PresenceStrip({ participants, max = 5 }: PresenceStripProps) {
  if (participants.length === 0) return null;

  const shown = participants.slice(0, max);
  const overflow = participants.length - shown.length;

  return (
    <div className="flex items-center -space-x-2" title={participants.map((p) => p.user.name).join(', ')}>
      {shown.map((p) => (
        <EntityAvatar
          key={p.user.id}
          name={p.user.name}
          className="w-7 h-7 rounded-full border-2 border-surface shadow-sm"
        />
      ))}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-surface bg-subtle text-ink-faint text-[10px] font-bold flex items-center justify-center shadow-sm">
          +{overflow}
        </div>
      )}
    </div>
  );
}

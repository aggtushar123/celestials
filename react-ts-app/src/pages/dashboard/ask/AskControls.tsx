import { useContext, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { History, MessageSquarePlus, Sparkles } from 'lucide-react';
import { HistoryPopover } from '../../../components/copilot/CopilotRail';
import { NavActionsSlotContext } from '../../../layouts/navActionsSlot';
import type { Conversation } from '../../copilot/types';

/** The Ask rail's controls, in the Navbar as Communications has them in its
 *  own top bar: New chat, History (its popover anchored inside the pill) and
 *  the Copilot switch. Markup and classes match CommunicationsPage's pill.
 *  Portaled into the Navbar's actions slot; renders nothing without one. */
export function AskControls({
  open,
  historyOpen,
  onNewChat,
  onToggleHistory,
  onCloseHistory,
  onOpenConversation,
  onToggle,
  toggleRef,
}: {
  open: boolean;
  historyOpen: boolean;
  onNewChat: () => void;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onToggle: () => void;
  toggleRef: Ref<HTMLButtonElement>;
}) {
  const { slot } = useContext(NavActionsSlotContext);
  if (!slot) return null;

  return createPortal(
    <div className="ml-auto flex items-center gap-1 rounded-xl bg-surface/70 border border-line p-1 relative">
      <button
        type="button"
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-subtle"
      >
        <MessageSquarePlus className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onToggleHistory}
        aria-label="History"
        aria-expanded={historyOpen}
        title="History"
        className={`w-9 h-9 rounded-lg flex items-center justify-center hover:bg-subtle ${historyOpen ? 'bg-subtle text-ink' : 'text-ink-muted hover:text-ink'}`}
      >
        <History className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
      <button
        ref={toggleRef}
        type="button"
        onClick={onToggle}
        aria-label={open ? 'Hide Copilot' : 'Show Copilot'}
        aria-pressed={open}
        title={open ? 'Hide Copilot' : 'Show Copilot'}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-[var(--dur-fast)] ${open ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink hover:bg-subtle'}`}
      >
        <Sparkles className="w-[18px] h-[18px]" aria-hidden="true" />
      </button>
      {historyOpen ? <HistoryPopover onClose={onCloseHistory} onOpen={onOpenConversation} /> : null}
    </div>,
    slot,
  );
}

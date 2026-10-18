import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CopilotRail } from '../../../components/copilot/CopilotRail';
import type { RailContext } from '../../../components/copilot/railContext';
import { trapTab } from '../../../lib/focusTrap';
import { SM, useMediaQuery } from '../../../lib/useMediaQuery';
import { AskControls } from './AskControls';
import { withFocus } from './context';
import { useAsk } from './useAsk';

/** The Ask rail beside the Dashboard or Organizations, shaped like Communications' Copilot
 *  rail: a 320px glass column, with its controls (New chat, History, the
 *  Copilot switch) in the Navbar's pill rather than a header of its own.
 *  Hidden means not rendered. Below `sm` the switch opens a full-screen
 *  sheet instead; focus moves in, Tab is trapped, and Escape or Close
 *  returns focus to the switch. */
export function AskRail() {
  const ask = useAsk();
  const isSm = useMediaQuery(SM);
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const toggled = useRef(false);
  const railOpen = isSm && Boolean(ask?.open);

  // Only the person's own switch moves focus: showing hands it to the
  // composer, hiding leaves it on the switch. A viewport change or an entry
  // point opening the rail does not.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    if (railOpen) railRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
    else toggleRef.current?.focus();
  }, [railOpen]);

  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetOpen = !isSm && Boolean(ask?.open);
  const setOpen = ask?.setOpen;

  const closeSheet = useCallback(() => {
    setOpen?.(false);
    toggleRef.current?.focus();
  }, [setOpen]);

  // Focus moves into the sheet when it opens: the composer (a prefilled
  // draft's autoFocus lands in the same place).
  useEffect(() => {
    if (sheetOpen) sheetRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
  }, [sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const root = sheetRef.current;
      if (!root) return;
      // History's own Escape closes History first; the sheet stays.
      if (event.key === 'Escape' && !historyOpen) closeSheet();
      if (event.key === 'Tab') trapTab(event, root);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen, historyOpen, closeSheet]);

  if (!ask) return null;

  const onToggle = () => {
    if (isSm) {
      toggled.current = true;
      ask.setOpen(!ask.open);
    } else if (ask.open) {
      closeSheet();
    } else {
      ask.setOpen(true);
    }
  };

  const { context, chipLabel } = ask.surface;
  const asked = context ? withFocus(context, ask.focus) : null;
  const railContext: RailContext | null = asked ? { kind: 'surface', context: asked, label: chipLabel(asked) } : null;

  const railProps = {
    label: 'Ask Revenact',
    context: railContext,
    onClearContext: ask.clearFocus,
    conversation: ask.conversation,
    onConversation: ask.setConversation,
    thread: ask.thread,
    chipLabel,
    draft: ask.pendingDraft,
    onSent: ask.markSent,
    onDraftEdited: ask.markDraftEdited,
    unavailable: ask.surface.unavailable ?? null,
    starters: ask.surface.starters,
  };

  const controls = (
    <AskControls
      open={ask.open}
      historyOpen={historyOpen}
      onNewChat={ask.newChat}
      onToggleHistory={() => setHistoryOpen((o) => !o)}
      onCloseHistory={closeHistory}
      onOpenConversation={ask.openFromHistory}
      onToggle={onToggle}
      toggleRef={toggleRef}
    />
  );

  if (!isSm) {
    return (
      <>
        {controls}
        {ask.open ? (
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Ask Revenact" className="animate-slide-in-right fixed inset-0 z-40 bg-surface flex flex-col">
            {/* The pill sits under the sheet, so the sheet carries its own way out. */}
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Close Ask Revenact"
                title="Close"
                className="w-11 h-11 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <X className="w-[18px] h-[18px]" aria-hidden="true" />
              </button>
            </div>
            <CopilotRail {...railProps} variant="plain" className="w-full flex-1 !rounded-none !border-0" />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {controls}
      {ask.open ? (
        <div ref={railRef} className="shrink-0 flex min-h-0">
          <CopilotRail {...railProps} variant="glass" className="w-[320px]" />
        </div>
      ) : null}
    </>
  );
}

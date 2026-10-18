import { useContext } from 'react';
import { Sparkles } from 'lucide-react';
import type { AskFocus } from '../../pages/copilot/types';
import { AskDraftContext } from '../../pages/dashboard/ask/context';
import { FOCUS } from '../organizations/portfolio/styles';

/** "Ask about this" (organisation page spec 2026-09-26 §3, Pipelines spec
 *  2026-09-30 §3): types `question` into the Ask rail, focused on `focus`
 *  for that one question, and opens the rail (the sheet on phones). It never
 *  sends. Only inside an Ask provider. The click stops here, so a Pipelines
 *  item or card around it does not open its form. */
export function AskAboutButton({ name, question, focus, className = '' }: { name: string; question: string; focus: AskFocus; className?: string }) {
  const draft = useContext(AskDraftContext);
  if (!draft) return null;
  return (
    <button
      type="button"
      draggable={false}
      onClick={(event) => {
        event.stopPropagation();
        draft(question, focus);
      }}
      aria-label={`Ask about this: ${name}`}
      className={`inline-flex min-h-11 shrink-0 max-sm:min-w-11 max-sm:justify-center items-center gap-1 rounded-sm text-[11px] font-semibold text-ink-muted hover:text-ink active:opacity-70 sm:min-h-9 ${FOCUS} ${className}`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      <span className="max-sm:sr-only">Ask about this</span>
    </button>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ExternalLink, Hash, Mail, Phone, Sparkles, Ticket, UserRound, type LucideIcon } from 'lucide-react';
import type { DiagnoseFinding, FindingSourceKind } from '../../features/agents/agentTypes';
import { OUTSIDE } from '../../features/agents/bundleText';
import { GUIDED, findingHref } from '../../features/agents/guidedText';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { REDUCED_MOTION, useEnter } from './useEnter';
import { FOCUS, INLINE_TARGET, TYPE } from '../ui';


/** A finding's source by kind. */
const FINDING_ICON: Record<FindingSourceKind, LucideIcon> = {
  ticket: Ticket,
  call: Phone,
  email: Mail,
  slack: Hash,
  health: Activity,
  contact: UserRound,
};

const SOURCE_LINK = `inline-flex items-center gap-1 font-semibold text-ink-muted hover:text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`;
/** The agent's bubble, on the left; the reader's on the right, in ink. */
const AGENT = `flex min-w-0 max-w-[85%] flex-col gap-2 rounded-xl rounded-tl-sm bg-subtle px-3 py-2 sm:max-w-[80%] ${TYPE.body} ${FOCUS}`;
const YOU = 'ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-accent px-3 py-2 text-[13px] leading-5 font-semibold text-on-accent sm:max-w-[80%]';
const YOU_NOT_NOW = 'ml-auto max-w-[85%] rounded-xl rounded-tr-sm border border-line px-3 py-2 text-[13px] leading-5 text-ink-muted sm:max-w-[80%]';


/** One agent line: the mark, then the bubble. Focus lands on the bubble after an answer. */
export function AgentBubble({ fresh = false, part, children }: { fresh?: boolean; part?: string; children: ReactNode }) {
  const enter = useEnter(fresh);
  return (
    <li className={`flex items-end gap-2 ${enter}`.trim()}>
      <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-muted">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div data-bubble="agent" data-part={part} tabIndex={-1} className={AGENT}>
        <span className="sr-only">{`${GUIDED.AGENT}: `}</span>
        {children}
      </div>
    </li>
  );
}

/** The reader's answer: "Yes" in ink, "Not now" quiet. */
export function YouBubble({ answer, fresh = false }: { answer: 'yes' | 'not-now'; fresh?: boolean }) {
  const enter = useEnter(fresh);
  return (
    <li className={`flex ${enter}`.trim()}>
      <p data-bubble="you" className={answer === 'yes' ? YOU : YOU_NOT_NOW}>
        <span className="sr-only">{`${GUIDED.YOU}: `}</span>
        {answer === 'yes' ? GUIDED.YES : GUIDED.NOT_NOW}
      </p>
    </li>
  );
}

/** Three dots that breathe while the agent works; still under reduced motion. */
export function TypingDots() {
  const reduced = useMediaQuery(REDUCED_MOTION);
  return (
    <span aria-hidden="true" data-part="typing" data-motion={reduced ? 'static' : 'animated'} className="inline-flex items-center gap-1">
      {[0, 1, 2].map((dot) => (
        <span key={dot} className={`h-1.5 w-1.5 rounded-full bg-ink-muted ${reduced ? 'opacity-60' : 'rv-typing-dot'}`} />
      ))}
    </span>
  );
}

/** A finding, its source's icon and where it opens: a tool's own https
 *  page in a new tab, an app path in the app, else the label alone. */
export function Finding({ finding }: { finding: DiagnoseFinding }) {
  const Icon = FINDING_ICON[finding.source.kind] ?? Sparkles;
  const target = findingHref(finding);
  return (
    <li className="flex min-w-0 items-start gap-2">
      <Icon data-source={finding.source.kind} className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <p className="break-words">{finding.text}</p>
        <p className={`${TYPE.meta} break-words`}>
          {target === null ? (
            <span>{finding.source.label}</span>
          ) : target.external ? (
            <a href={target.href} target="_blank" rel="noopener noreferrer" className={SOURCE_LINK}>
              {finding.source.label}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">{OUTSIDE.OPENS_NEW_TAB}</span>
            </a>
          ) : (
            <Link to={target.href} className={SOURCE_LINK}>
              {finding.source.label}
            </Link>
          )}
        </p>
      </div>
    </li>
  );
}

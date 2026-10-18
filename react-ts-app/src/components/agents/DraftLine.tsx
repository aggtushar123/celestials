import { Link } from 'react-router-dom';
import { FilePen } from 'lucide-react';
import { AGENTS, draftHref } from '../../features/agents/agentsText';
import { draftByText } from '../../features/agents/draftsText';
import type { QueueDraft } from '../../features/agents/draftTypes';
import { FOCUS, TYPE } from '../ui';

const OPEN = `inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`;

/** The queue's line under an email or ticket the reader has an open agent
 *  draft for (Agents delivery 2): who drafted it, and Open draft. */
export function DraftLine({ draft }: { draft: QueueDraft }) {
  return (
    <p data-part="draft" className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.body}`}>
      <FilePen className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span>{draftByText(draft.agent)}</span>
      <Link to={draftHref(draft.id)} className={OPEN}>
        {AGENTS.OPEN_DRAFT}
      </Link>
    </p>
  );
}

import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FilePen } from 'lucide-react';
import { AGENT_LABEL } from '../../features/agents/agentsText';
import { listDrafts } from '../../features/agents/draftsApi';
import { DRAFTS, recipientsText, withDraft } from '../../features/agents/draftsText';
import type { ReplyDraft } from '../../features/agents/draftTypes';
import { formatDate } from '../../features/customers/formatters';
import { BUTTON, FOCUS, LoadingState, NUM, TYPE } from '../ui';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

const ROW_LINK = `flex min-h-11 min-w-0 flex-col justify-center gap-0.5 px-4 py-3 hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

type Answer = { key: number; rows: ReplyDraft[] | null; error: string | null };

function Dot() {
  return <span aria-hidden="true">·</span>;
}

/** Mailbox › Drafts, above the provider's drafts (Agents delivery 2,
 *  Decision 10): the reader's own open email drafts from their agents. Each
 *  opens the draft in place of the mailbox card, keeping `source`. */
export function AgentDraftsList() {
  const { search } = useLocation();
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    listDrafts({ channel: 'email' }).then(
      ({ results }) => {
        if (alive) setAnswer({ key: attempt, rows: results, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: attempt, rows: null, error: errorMessage(err, DRAFTS.LIST_LOAD) });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const current = answer?.key === attempt ? answer : null;
  // A draft also in the owner's Gmail is listed once, as its mailbox row (two-way Gmail D3, Decision 11).
  const rows = current?.rows ? current.rows.filter((draft) => !draft.mail_draft_id) : null;
  return (
    <section aria-labelledby={headingId} data-part="agent-drafts" className="mb-2 flex flex-col">
      <h3 id={headingId} className={`px-4 pt-3 pb-1 ${TYPE.label}`}>
        {DRAFTS.LIST_TITLE}
      </h3>
      {!current ? <LoadingState label={DRAFTS.LIST_LOADING} count={2} /> : null}
      {current?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 px-4 text-[13px] leading-5 text-danger-ink">
          <span>{current.error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={BUTTON}>
            {DRAFTS.TRY_AGAIN}
          </button>
        </div>
      ) : null}
      {rows && rows.length === 0 ? <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>{DRAFTS.LIST_EMPTY}</p> : null}
      {rows && rows.length > 0 ? (
        <ul aria-label={DRAFTS.LIST_LABEL} className="flex flex-col divide-y divide-line-subtle">
          {rows.map((draft) => (
            <li key={draft.id} data-draft={draft.id}>
              <Link to={withDraft(search, draft.id)} className={ROW_LINK}>
                <span className={`flex min-w-0 items-center gap-2 ${TYPE.body} font-semibold`}>
                  <FilePen className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="truncate">{draft.subject ?? ''}</span>
                </span>
                <span className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
                  <span>{draft.to ? recipientsText(draft.to) : ''}</span>
                  <Dot />
                  <span>{draft.record.name}</span>
                  <Dot />
                  <span>{AGENT_LABEL[draft.agent]}</span>
                  {draft.edited ? (
                    <>
                      <Dot />
                      <span>{DRAFTS.EDITED}</span>
                    </>
                  ) : null}
                  <Dot />
                  <span className={NUM}>{formatDate(draft.created_at.slice(0, 10))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

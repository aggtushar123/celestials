import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft, FilePen } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { formatDate } from '../../features/customers/formatters';
import { refusalCode, refusalDetail } from '../../features/agents/agentsApi';
import { confirmDraftSent, fetchDraft, reopenDraft } from '../../features/agents/draftsApi';
import { DRAFTS, draftByText, draftHeading, draftParam, mailboxDraftHref, notOwnerText, recipientsText, sentText, sourceText, withoutDraft } from '../../features/agents/draftsText';
import type { ReplyDraft } from '../../features/agents/draftTypes';
import { recordHref } from '../../features/segments/segmentFields';
import { Figured } from '../brain/Figured';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { BUTTON, Card, EmptyState, ErrorState as UiErrorState, FOCUS, LoadingState, NUM, PRIMARY, QUIET, TYPE } from '../ui';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { DraftForm } from './DraftForm';

/** How often a draft still `pending` is read again. */
const SENDING_POLL_MS = 60_000;
const BACK = `-ml-3 self-start ${QUIET}`;
const META_LINK = `inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;
const LABEL = TYPE.meta;

type DraftLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; draft: ReplyDraft };

/** One draft, read for the reader: `missing` for a 404 (gone, or not
 *  theirs to read); `replace` swaps in a write's answer; `reread` reads
 *  again without the skeleton. */
function useDraft(id: number) {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: DraftLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchDraft(id).then(
      (draft) => {
        if (alive) setAnswer({ key, load: { status: 'ready', draft } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, DRAFTS.LOAD) } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((draft: ReplyDraft) => setAnswer({ key, load: { status: 'ready', draft } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const reread = useCallback(() => {
    fetchDraft(id).then(replace, (err: unknown) => {
      // Gone, or no longer the reader's to open: stop showing (and polling) it.
      if (err instanceof ApiError && err.status === 404) setAnswer({ key, load: { status: 'missing' } });
    });
  }, [id, key, replace]);
  const load: DraftLoad = answer?.key === key ? answer.load : { status: 'loading' };
  return { load, replace, retry, reread };
}

/** The sentence for a draft that is sent, mid-send or someone else's. */
function readOnlyText(draft: ReplyDraft): ReactNode {
  if (draft.sending === 'pending') return DRAFTS.IN_FLIGHT;
  if (draft.sending === 'unconfirmed') return DRAFTS.UNCONFIRMED;
  return draft.status === 'sent' ? <Figured text={sentText(draft)} /> : notOwnerText(draft);
}

/** A send nobody could confirm: the person who may send it says what
 *  happened (It was sent, or Reopen draft); the server's answer replaces the
 *  draft. A refusal is shown in the server's words. */
function UnconfirmedActions({ draft, onAnswer, onStale }: { draft: ReplyDraft; onAnswer: (draft: ReplyDraft, text: string, focus: boolean) => void; onStale: (text: string) => void }) {
  const [alert, setAlert] = useState('');
  const [pending, setPending] = useState<'confirm' | 'reopen' | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const { busy, run, release } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (alert) alertRef.current?.focus();
  }, [alert]);

  async function resolve(verb: 'confirm' | 'reopen') {
    const outcome = await run(() => {
      setAlert('');
      setPending(verb);
      return verb === 'confirm' ? confirmDraftSent(draft.id) : reopenDraft(draft.id);
    });
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) {
      release();
      onAnswer(outcome.value, verb === 'confirm' ? DRAFTS.CONFIRMED : DRAFTS.REOPENED, true);
    } else if (refusalCode(outcome.error) === 'NOT_UNCONFIRMED') {
      // Someone else settled it: say why and read it again, so stale buttons go.
      onStale(refusalDetail(outcome.error) ?? DRAFTS.CONFIRM_FAILED);
    } else setAlert(refusalDetail(outcome.error) ?? errorMessage(outcome.error, verb === 'confirm' ? DRAFTS.CONFIRM_FAILED : DRAFTS.REOPEN_FAILED));
  }

  return (
    <div className="flex flex-col gap-2">
      {alert ? (
        <p ref={alertRef} role="alert" tabIndex={-1} className={`text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
          {alert}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void resolve('confirm')} className={PRIMARY}>
          {pending === 'confirm' ? DRAFTS.CONFIRMING : DRAFTS.CONFIRM_SENT}
        </button>
        <button type="button" disabled={busy} onClick={() => void resolve('reopen')} className={BUTTON}>
          {pending === 'reopen' ? DRAFTS.REOPENING : DRAFTS.REOPEN}
        </button>
      </div>
    </div>
  );
}

/** Decision 7: a sent draft, one mid-send, or someone else's, as text. */
function DraftReadOnly({ draft, onAnswer, onStale }: { draft: ReplyDraft; onAnswer: (draft: ReplyDraft, text: string, focus: boolean) => void; onStale: (text: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-part="read-only" className="text-[13px] text-ink-muted">
        {readOnlyText(draft)}
      </p>
      {draft.sending === 'unconfirmed' && draft.can_resolve ? <UnconfirmedActions draft={draft} onAnswer={onAnswer} onStale={onStale} /> : null}
      {draft.to ? (
        <div className="flex flex-col gap-0.5">
          <span className={LABEL}>{DRAFTS.TO}</span>
          <span className="text-[13px] text-ink">{recipientsText(draft.to)}</span>
        </div>
      ) : null}
      {draft.subject !== null ? (
        <div className="flex flex-col gap-0.5">
          <span className={LABEL}>{DRAFTS.SUBJECT}</span>
          <span className="text-[13px] text-ink">{draft.subject}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <span className={LABEL}>{DRAFTS.BODY}</span>
        <p data-part="body" className="max-w-[70ch] whitespace-pre-line text-[13px] text-ink">
          {draft.body}
        </p>
      </div>
    </div>
  );
}

/** A reply draft (Agents delivery 2; Decisions 1, 6, 7): Back, an
 *  always-mounted status line, then the draft: its heading (focused on
 *  arrival), who drafted it on which record, what it answers, and the
 *  owner's form or the read-only view. */
export function DraftPanel({ id, backTo, onChanged }: { id: number; backTo: string; onChanged?: () => void }) {
  const headingId = useId();
  const { load, replace, retry, reread } = useDraft(id);
  const pendingSend = load.status === 'ready' && load.draft.sending === 'pending';
  // The payload has no claim time, so a draft mid-send is read again each
  // minute until it is no longer pending (it turns unconfirmed or sent).
  useEffect(() => {
    if (!pendingSend) return;
    const timer = setInterval(reread, SENDING_POLL_MS);
    return () => clearInterval(timer);
  }, [pendingSend, reread]);
  const [notice, setNotice] = useState('');
  const [noticeTick, setNoticeTick] = useState(0);
  const [discarded, setDiscarded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const ready = load.status === 'ready';
  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);
  useEffect(() => {
    if (noticeTick > 0) noticeRef.current?.focus();
  }, [noticeTick]);

  function say(text: string, focus: boolean) {
    setNotice(text);
    if (focus) setNoticeTick((n) => n + 1);
  }

  // A write's answer: swap it in and say it; tell the page when the draft was sent.
  const answer = (next: ReplyDraft, text: string, focus: boolean) => {
    replace(next);
    say(text, focus);
    if (next.status === 'sent') onChanged?.();
  };
  const stale = (text: string) => {
    say(text, true);
    reread();
    onChanged?.();
  };
  // Resolving an unconfirmed send changes the open list either way (sent, or open again).
  const resolved = (next: ReplyDraft, text: string, focus: boolean) => {
    replace(next);
    say(text, focus);
    onChanged?.();
  };

  let body: ReactNode = null;
  if (discarded) body = null;
  else if (load.status === 'loading') body = <LoadingState label={DRAFTS.LOADING} variant="block" />;
  else if (load.status === 'missing') body = <EmptyState title={DRAFTS.MISSING_TITLE} detail={DRAFTS.MISSING} />;
  else if (load.status === 'failed') body = <UiErrorState message={load.message} onRetry={retry} />;
  else {
    const { draft } = load;
    body = (
      <article aria-labelledby={headingId} className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className={`${TYPE.title} ${FOCUS}`}>
            {draftHeading(draft)}
          </h2>
          <p data-part="meta" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
            <FilePen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{draftByText(draft.agent)}</span>
            <span aria-hidden="true">·</span>
            <Link to={recordHref(draft.record.kind, draft.record.id)} className={META_LINK}>
              {draft.record.name}
            </Link>
            <span aria-hidden="true">·</span>
            <span className={NUM}>{formatDate(draft.created_at.slice(0, 10))}</span>
            {draft.edited ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{DRAFTS.EDITED}</span>
              </>
            ) : null}
          </p>
          {draft.mail_draft_id ? (
            <Link to={mailboxDraftHref(draft.mail_draft_id)} className={`self-start text-[11px] ${META_LINK}`}>
              {DRAFTS.IN_MAILBOX}
            </Link>
          ) : null}
        </header>
        <p data-part="source" className={`max-w-[70ch] border-l-2 border-line pl-3 ${TYPE.body}`}>
          <span className="sr-only">{`${DRAFTS.SOURCE}: `}</span>
          <Figured text={sourceText(draft)} />
        </p>
        {draft.status === 'open' && draft.can_edit ? (
          <DraftForm
            draft={draft}
            onAnswer={answer}
            onStale={stale}
            onDiscarded={() => {
              setDiscarded(true);
              say(DRAFTS.DISCARDED, true);
              onChanged?.();
            }}
          />
        ) : (
          <DraftReadOnly draft={draft} onAnswer={resolved} onStale={stale} />
        )}
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to={backTo} className={BACK}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {DRAFTS.BACK}
      </Link>
      {/* Always mounted, so what a write says lands in a live region that already exists. */}
      <p ref={noticeRef} role="status" tabIndex={-1} className={`min-h-[1.1em] text-[13px] text-ink ${FOCUS}`}>
        {notice}
      </p>
      {body}
    </div>
  );
}

/** `/communications?draft=<id>` (Decision 1): the draft in place of the
 *  inbox or mailbox card. Back drops only `draft`. */
export function DraftRoute({ onChanged }: { onChanged?: () => void }) {
  const [params] = useSearchParams();
  const { search } = useLocation();
  const id = draftParam(params);
  if (id === null) return null;
  return (
    <Card as="section" aria-label={DRAFTS.REGION} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <DraftPanel key={id} id={id} backTo={withoutDraft(search)} onChanged={onChanged} />
    </Card>
  );
}

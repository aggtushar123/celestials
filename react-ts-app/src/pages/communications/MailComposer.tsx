// Writing mail in the mailbox (two-way Gmail D3, spec §4 "Compose";
// Decisions 2 to 10): a new message, a reply, reply all or forward, or a
// draft opened from Drafts. It takes the reading pane with Back (the whole
// card on a phone). The draft saves itself 2 s after a change
// (DraftSession); the line by the title says where it is. A draft changed
// in Gmail meanwhile is shown and the person chooses. Sending keeps
// today's unconfirmed and superseded states, in the agent drafts' words.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Send, Trash2 } from 'lucide-react';
import { useDraftSession } from '../../features/mail/useDraftSession';
import { attachmentBytes, type ComposeTarget } from '../../features/mail/draftSession';
import { recipientText, type DraftFailure, type DraftField, type MailDraft } from '../../features/mail/mailDrafts';
import {
  ADD_BCC,
  ADD_CC,
  BACK,
  CHANGED_CHOICE,
  CHANGED_IN_GMAIL,
  CLOSE_ANYWAY,
  CLOSE_UNSAVED,
  COMPOSE_OPENING,
  composeTitle,
  DISCARD_DRAFT,
  FIELD_BCC,
  FIELD_CC,
  FIELD_FROM,
  FIELD_MESSAGE,
  FIELD_SUBJECT,
  FIELD_TO,
  KEEP_MINE,
  MESSAGE_SENT,
  PREFILL_FAILED,
  QUOTE_HIDE,
  QUOTE_SHOW,
  QUOTE_TITLE,
  SAVING,
  saveLine,
  SEND,
  SENDING,
  USE_GMAIL,
} from '../../features/mail/mailText';
import { DRAFTS } from '../../features/agents/draftsText';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { BUTTON, ErrorState as UiErrorState, ICON_BUTTON, INPUT, INVALID, LoadingState, PRIMARY, QUIET, TYPE } from '../../components/ui';
import { ComposeAttachments } from './ComposeAttachments';
import { DraftRecordLine } from './DraftRecordLine';
import { MailEditor } from './MailEditor';
import { MailHtmlBody } from './MailHtmlBody';
import { RecipientField } from './RecipientField';

/** Field errors shown under their own field; any other refusal is the alert by Send. */
const SHOWN_FIELDS: DraftField[] = ['to', 'cc', 'bcc', 'subject', 'html', 'record'];
const FIELD_ERROR = 'text-[11px] leading-4 text-danger-ink';
const ALERT = 'flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] leading-5 text-danger-ink';

function alertOf(failure: DraftFailure | null): DraftFailure | null {
  if (!failure) return null;
  return SHOWN_FIELDS.some((field) => failure.fields[field]) ? null : failure;
}

export function MailComposer({
  target,
  onClose,
  onSent,
  onDiscarded,
  autosaveMs,
  savingPollMs,
}: {
  target: ComposeTarget;
  onClose: () => void;
  /** The draft went (a 200 send, or It was sent on an unconfirmed one); called once. */
  onSent: (draft: MailDraft) => void;
  /** Called once. */
  onDiscarded: () => void;
  /** Tests shorten the 2 s autosave. */
  autosaveMs?: number;
  /** Tests shorten the 3 s read-again while Gmail is saving. */
  savingPollMs?: number;
}) {
  const [state, session] = useDraftSession(target, autosaveMs, savingPollMs);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const { busy: resolving, run } = useSubmitOnce();
  const toRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { phase, draft, failure, fields } = state;
  const ready = phase === 'ready';
  const nobody = fields.to.length === 0;

  // To when nobody is in it yet, the text otherwise.
  useEffect(() => {
    if (!ready) return;
    if (nobody) toRef.current?.focus();
    else editorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when it becomes ready, not on every recipient change
  }, [ready]);

  // The mailbox hears the end once, whatever its handlers do on re-render.
  const ended = useRef(false);
  useEffect(() => {
    if (ended.current) return;
    if (phase === 'sent' && draft) {
      ended.current = true;
      onSent(draft);
    } else if (phase === 'discarded') {
      ended.current = true;
      onDiscarded();
    }
  }, [phase, draft, onSent, onDiscarded]);

  /** It was sent: once the server agrees, the mailbox treats it as a send. */
  async function confirmSent() {
    await session.resolve('confirm');
    const settled = session.getState().draft;
    if (ended.current || settled?.status !== 'sent' || settled.sending !== null) return;
    ended.current = true;
    onSent(settled);
  }

  async function back() {
    if (await session.close()) onClose();
    // A Gmail change waiting for a choice keeps it open; its banner says why.
    else if (!session.getState().conflict) setUnsaved(true);
  }

  async function attach(chosen: File[]) {
    for (const file of chosen) await session.upload(file);
  }

  const title = composeTitle(state.kind);
  const readOnly = draft !== null && (draft.status === 'sent' || draft.sending !== null);
  const files = draft ? draft.attachments : state.forwarded;
  const { total, max } = attachmentBytes(state);
  const alert = alertOf(failure);
  const ccOpen = showCc || fields.cc.length > 0;
  const bccOpen = showBcc || fields.bcc.length > 0;
  const status = readOnly ? '' : state.saving ? SAVING : saveLine(draft);
  // Edits made while a send is in flight would be refused (DraftSession.edit), so the fields hold still.
  const held = state.sending;
  const readOnlyText = draft?.sending === 'pending' ? DRAFTS.IN_FLIGHT : draft?.sending === 'unconfirmed' ? DRAFTS.UNCONFIRMED : MESSAGE_SENT;

  return (
    <section aria-label={title} data-mail-composer className="flex grow min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-line-subtle pb-2">
        <button type="button" onClick={() => void back()} className={`-ml-3 ${QUIET}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {BACK}
        </button>
        <h2 className={TYPE.title}>{title}</h2>
        <span role="status" className={`ml-auto ${TYPE.meta}`}>
          {status}
        </span>
      </div>

      {/* Only while nothing is stored: the next save that takes clears it. */}
      {unsaved && draft === null ? (
        <div role="alert" className={`py-2 ${ALERT}`}>
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{CLOSE_UNSAVED}</span>
          <button type="button" onClick={onClose} className={QUIET}>
            {CLOSE_ANYWAY}
          </button>
        </div>
      ) : null}

      {phase === 'loading' ? <LoadingState label={COMPOSE_OPENING} variant="block" /> : null}
      {phase === 'failed' ? <UiErrorState message={state.loadError ?? PREFILL_FAILED} onRetry={() => void session.restart()} /> : null}

      {readOnly && draft ? (
        <div className="flex flex-col gap-3 py-3">
          <p className={TYPE.body}>{readOnlyText}</p>
          {draft.sending === 'unconfirmed' && draft.can_resolve ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={resolving} onClick={() => void run(confirmSent)} className={BUTTON}>
                {DRAFTS.CONFIRM_SENT}
              </button>
              <button type="button" disabled={resolving} onClick={() => void run(() => session.resolve('reopen'))} className={BUTTON}>
                {DRAFTS.REOPEN}
              </button>
            </div>
          ) : null}
          {failure && failure.text !== readOnlyText ? (
            <p role="alert" className={ALERT}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {failure.text}
            </p>
          ) : null}
          <p className={TYPE.meta}>{`${FIELD_TO} ${draft.to.map(recipientText).join(', ')}`}</p>
          <p className={TYPE.meta}>{`${FIELD_SUBJECT}: ${draft.subject}`}</p>
        </div>
      ) : null}

      {ready && !readOnly ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-3 custom-scrollbar">
            {state.conflict ? (
              <div role="alert" className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2">
                <p className={`flex items-center gap-2 ${TYPE.label}`}>
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {CHANGED_IN_GMAIL}
                </p>
                <p className={TYPE.bodyMuted}>{CHANGED_CHOICE}</p>
                <div className="flex flex-col gap-1 border-l-2 border-line pl-3">
                  <p className={TYPE.meta}>{`${FIELD_SUBJECT}: ${state.conflict.subject}`}</p>
                  <p className={`max-w-[68ch] whitespace-pre-line ${TYPE.body}`}>{state.conflict.text}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => session.takeGmail()} className={BUTTON}>
                    {USE_GMAIL}
                  </button>
                  <button type="button" onClick={() => session.keepMine()} className={BUTTON}>
                    {KEEP_MINE}
                  </button>
                </div>
              </div>
            ) : null}
            {state.from ? <p className={TYPE.meta}>{`${FIELD_FROM} ${recipientText([state.from.name, state.from.address])}`}</p> : null}
            <RecipientField label={FIELD_TO} value={fields.to} onChange={(to) => session.edit({ to })} error={failure?.fields.to ?? null} inputRef={toRef} disabled={held} />
            {ccOpen ? <RecipientField label={FIELD_CC} value={fields.cc} onChange={(cc) => session.edit({ cc })} error={failure?.fields.cc ?? null} disabled={held} /> : null}
            {bccOpen ? <RecipientField label={FIELD_BCC} value={fields.bcc} onChange={(bcc) => session.edit({ bcc })} error={failure?.fields.bcc ?? null} disabled={held} /> : null}
            {!ccOpen || !bccOpen ? (
              <div className="-mt-2 flex flex-wrap">
                {!ccOpen ? (
                  <button type="button" onClick={() => setShowCc(true)} className={`-ml-3 ${QUIET}`}>
                    {ADD_CC}
                  </button>
                ) : null}
                {!bccOpen ? (
                  <button type="button" onClick={() => setShowBcc(true)} className={QUIET}>
                    {ADD_BCC}
                  </button>
                ) : null}
              </div>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className={TYPE.label}>{FIELD_SUBJECT}</span>
              <input type="text" value={fields.subject} maxLength={255} disabled={held} onChange={(event) => session.edit({ subject: event.target.value })} aria-invalid={failure?.fields.subject ? true : undefined} className={`${INPUT} ${INVALID}`} />
              {failure?.fields.subject ? <span className={FIELD_ERROR}>{failure.fields.subject}</span> : null}
            </label>
            <MailEditor key={state.seed} label={FIELD_MESSAGE} html={fields.body} onChange={(body) => session.edit({ body })} editorRef={editorRef} disabled={held} />
            {failure?.fields.html ? <p className={FIELD_ERROR}>{failure.fields.html}</p> : null}
            {state.quote ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setShowQuote((open) => !open)} aria-expanded={showQuote} className={`-ml-3 self-start ${QUIET}`}>
                  {showQuote ? QUOTE_HIDE : QUOTE_SHOW}
                </button>
                {showQuote ? (
                  <div className="h-80">
                    <MailHtmlBody html={state.quote} title={QUOTE_TITLE} />
                  </div>
                ) : null}
              </div>
            ) : null}
            <ComposeAttachments files={files} uploads={state.uploads} total={total} max={max} failedId={failure?.attachmentId ?? null} onAttach={(chosen) => void attach(chosen)} onRemove={(id) => void session.removeAttachment(id)} />
            <DraftRecordLine record={state.record} suggested={state.suggested} chosen={state.recordChosen} fixed={Boolean(draft?.agent)} onChange={(record) => session.setRecord(record)} />
            {failure?.fields.record ? <p className={FIELD_ERROR}>{failure.fields.record}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line-subtle pt-2">
            <button type="button" onClick={() => void session.send()} disabled={state.sending || state.conflict !== null || state.uploads.length > 0} className={PRIMARY}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {state.sending ? SENDING : SEND}
            </button>
            {alert ? (
              <p role="alert" className={`flex-1 ${ALERT}`}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{alert.text}</span>
                {alert.reconnect ? (
                  <Link to="/settings/connections" className={QUIET}>
                    {DRAFTS.CONNECT}
                  </Link>
                ) : null}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            <button type="button" onClick={() => void session.discard()} aria-label={DISCARD_DRAFT} title={DISCARD_DRAFT} className={ICON_BUTTON}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

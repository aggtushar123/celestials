import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MailCheck, Send, Trash2 } from 'lucide-react';
import { pausedSendMessage } from '../../features/mail/mailText';
import { refusalCode, refusalDetail } from '../../features/agents/agentsApi';
import { discardDraft, draftFieldErrors, markDraftSent, saveDraft, sendDraft, type DraftField } from '../../features/agents/draftsApi';
import { DRAFTS, copyLabel, recipientsText, sentNotice } from '../../features/agents/draftsText';
import type { DraftPatch, ReplyDraft } from '../../features/agents/draftTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { CONTROL } from '../organizations/activity/formStyles';
import { BUTTON, FOCUS, PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';

const FIELD = `min-h-11 ${CONTROL}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';
const FIELD_ERROR = 'text-[11px] text-danger';
const ALERT_LINK = `inline-flex min-h-11 items-center self-start font-semibold text-ink underline sm:min-h-0 ${FOCUS}`;

type Alert = { text: string; connect: boolean };

/** The owner's editor for an open draft (Agents delivery 2; Decisions 2 to 6).
 *  Email: To as text, Subject and Reply; Send (the primary) and Save carry
 *  only the changed fields. Ticket: Reply; Copy and open (the primary), then
 *  Mark as sent, which saves an edited reply first. Discard asks first. Every
 *  refusal is the server's: a field error under its field, ALREADY_SENT and
 *  NOT_YOURS to the panel, anything else in this form's alert. */
export function DraftForm({
  draft,
  onAnswer,
  onStale,
  onDiscarded,
}: {
  draft: ReplyDraft;
  onAnswer: (draft: ReplyDraft, text: string, focus: boolean) => void;
  onStale: (text: string) => void;
  onDiscarded: () => void;
}) {
  const ids = useId();
  const email = draft.channel === 'email';
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [fields, setFields] = useState<Partial<Record<DraftField, string>>>({});
  const [alert, setAlert] = useState<Alert | null>(null);
  const [pending, setPending] = useState<'save' | 'send' | 'mark' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  // Held after a success, so a second click before the panel re-renders the
  // draft as sent sends nothing; Save frees it again (it may save twice).
  const { busy, run, release } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);

  const changes: DraftPatch = {};
  if (body !== draft.body) changes.body = body;
  if (email && subject !== (draft.subject ?? '')) changes.subject = subject;
  const dirty = Object.keys(changes).length > 0;

  function begin(verb: 'save' | 'send' | 'mark') {
    setFields({});
    setAlert(null);
    setPending(verb);
  }

  function refuse(err: unknown, fallback: string) {
    const named = draftFieldErrors(err);
    if (Object.keys(named).length > 0) {
      setFields(named);
      // The first refused field in the page's order.
      (named.subject ? subjectRef : bodyRef).current?.focus();
      return;
    }
    const code = refusalCode(err);
    const text = pausedSendMessage(err) ?? refusalDetail(err) ?? errorMessage(err, fallback);
    if (code === 'ALREADY_SENT' || code === 'NOT_YOURS' || code === 'SEND_UNCONFIRMED' || code === 'SEND_SUPERSEDED') {
      onStale(text);
      return;
    }
    setAlert({ text, connect: code === 'NO_MAILBOX' || code === 'MAILBOX_PAUSED' });
    setTick((n) => n + 1);
  }

  async function save() {
    if (!dirty) return;
    const outcome = await run(() => {
      begin('save');
      return saveDraft(draft.id, changes);
    });
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) {
      release();
      onAnswer(outcome.value, DRAFTS.SAVED, false);
    } else refuse(outcome.error, DRAFTS.SAVE_FAILED);
  }

  async function send() {
    const outcome = await run(() => {
      begin('send');
      return sendDraft(draft.id, changes);
    });
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) onAnswer(outcome.value.draft, sentNotice(outcome.value.draft), true);
    else refuse(outcome.error, DRAFTS.SEND_FAILED);
  }

  async function markSent() {
    const outcome = await run(async () => {
      begin('mark');
      // Decision 4: the record holds what was posted.
      if (dirty) await saveDraft(draft.id, changes);
      return markDraftSent(draft.id);
    });
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) onAnswer(outcome.value, sentNotice(outcome.value), true);
    else refuse(outcome.error, DRAFTS.MARK_FAILED);
  }

  async function copy() {
    if (draft.source.kind !== 'ticket') return;
    const source = draft.source;
    setAlert(null);
    // Decision 5: the write starts inside the click, before a new tab takes focus.
    const copying = navigator.clipboard?.writeText(body) ?? Promise.reject(new Error('No clipboard'));
    if (source.external_url && source.source_name) window.open(source.external_url, '_blank', 'noopener,noreferrer');
    try {
      await copying;
      onAnswer(draft, DRAFTS.COPIED, false);
    } catch {
      setAlert({ text: DRAFTS.COPY_FAILED, connect: false });
      setTick((n) => n + 1);
    }
  }

  const subjectId = `${ids}-subject`;
  const bodyId = `${ids}-body`;
  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void (email ? send() : save());
        }}
      >
        {email && draft.to ? (
          <div className="flex flex-col gap-0.5">
            <span className={LABEL}>{DRAFTS.TO}</span>
            <span data-part="to" className="text-[13px] text-ink">
              {recipientsText(draft.to)}
            </span>
          </div>
        ) : null}
        {email ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={subjectId} className={LABEL}>
              {DRAFTS.SUBJECT}
            </label>
            <input
              id={subjectId}
              ref={subjectRef}
              value={subject}
              aria-invalid={Boolean(fields.subject)}
              aria-describedby={fields.subject ? `${subjectId}-error` : undefined}
              onChange={(event) => {
                setSubject(event.target.value);
                setFields((now) => ({ ...now, subject: undefined }));
              }}
              className={FIELD}
            />
            {fields.subject ? (
              <p id={`${subjectId}-error`} className={FIELD_ERROR}>
                {fields.subject}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-ink-muted">{DRAFTS.TICKET_HINT}</p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={bodyId} className={LABEL}>
            {DRAFTS.BODY}
          </label>
          <textarea
            id={bodyId}
            ref={bodyRef}
            rows={12}
            value={body}
            aria-invalid={Boolean(fields.body)}
            aria-describedby={fields.body ? `${bodyId}-error` : undefined}
            onChange={(event) => {
              setBody(event.target.value);
              setFields((now) => ({ ...now, body: undefined }));
            }}
            className={`${FIELD} max-w-[70ch] leading-relaxed`}
          />
          {fields.body ? (
            <p id={`${bodyId}-error`} className={FIELD_ERROR}>
              {fields.body}
            </p>
          ) : null}
        </div>
        {alert ? (
          <div ref={alertRef} role="alert" tabIndex={-1} className={`flex flex-col gap-1 text-[13px] text-danger ${FOCUS}`}>
            <p>{alert.text}</p>
            {alert.connect ? (
              <Link to="/settings/connections" className={ALERT_LINK}>
                {DRAFTS.CONNECT}
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {email ? (
            <button type="submit" disabled={busy} className={PRIMARY}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {pending === 'send' ? DRAFTS.SENDING : DRAFTS.SEND}
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void copy()} className={PRIMARY}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                {draft.source.kind === 'ticket' ? copyLabel(draft.source) : DRAFTS.COPY}
              </button>
              <button type="button" disabled={busy} onClick={() => void markSent()} className={BUTTON}>
                <MailCheck className="h-4 w-4" aria-hidden="true" />
                {pending === 'mark' ? DRAFTS.MARKING : DRAFTS.MARK_SENT}
              </button>
            </>
          )}
          <button type={email ? 'button' : 'submit'} disabled={busy || !dirty} onClick={email ? () => void save() : undefined} className={BUTTON}>
            {pending === 'save' ? DRAFTS.SAVING : DRAFTS.SAVE}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={QUIET}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {DRAFTS.DISCARD}
          </button>
        </div>
      </form>
      {confirming ? (
        <ConfirmDialog
          title={DRAFTS.DISCARD_TITLE}
          message={DRAFTS.DISCARD_MESSAGE}
          confirmLabel={DRAFTS.DISCARD}
          danger
          onConfirm={async () => {
            try {
              await discardDraft(draft.id);
            } catch (err) {
              const code = refusalCode(err);
              // Decision 6: the panel says why and reads the draft again; returning closes the dialog.
              if (code === 'ALREADY_SENT' || code === 'NOT_YOURS') {
                onStale(refusalDetail(err) ?? DRAFTS.DISCARD_FAILED);
                return;
              }
              // ConfirmDialog shows a thrown string as its error.
              throw refusalDetail(err) ?? DRAFTS.DISCARD_FAILED;
            }
            onDiscarded();
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}

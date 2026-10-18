// The reply box under an open conversation: what the person types, a draft
// from the Copilot when they ask for one, and the records that draft was
// built from, so they can check it before it goes out.
//
// The draft is grounded in the thread and the account's history (see
// revenact-backend `POST /copilot/draft-reply/`); it lands in the box as
// text the person edits and sends themselves. Nothing is sent by the AI.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Languages, Sparkles } from 'lucide-react';
import { draftReply } from '../copilot/copilotApi';
import { languageName, translateText } from '../../features/translation/translationApi';
import type { MessageSource } from '../copilot/types';
import { hrefOf } from '../copilot/sourceHref';
import { ApiError } from '../../lib/apiClient';
import { BUTTON, FOCUS, PRIMARY, TYPE } from '../../components/ui';

export interface ReplyBoxProps {
  label: string;
  placeholder: string;
  hint: string;
  sendLabel: string;
  /** What the Copilot drafts from; omit and the draft button is not shown. */
  draftSource?: { kind: 'email' | 'mail_message'; id: number };
  /** The language this person writes in, when it is known. Offers to put
   *  the reply into it before it is sent (see services/translation). */
  theirLanguage?: string;
  /** Omit when sending is not wired for this kind of item; the button then says so. */
  onSend?: (body: string) => void;
  sending?: boolean;
  sent?: boolean;
  error?: string | null;
}

export function ReplyBox({ label, placeholder, hint, sendLabel, draftSource, theirLanguage, onSend, sending = false, sent = false, error = null }: ReplyBoxProps) {
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  // One thing may write to the draft at a time: two answers landing out of
  // order would silently throw one of them away.
  const busy = drafting || translating;
  const [sources, setSources] = useState<MessageSource[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const id = `reply-${draftSource?.kind ?? 'box'}-${draftSource?.id ?? 0}`;

  /** The draft, in the language they write in. The person still reads it
   *  and still presses send: nothing goes out because a model said so. */
  async function intoTheirLanguage() {
    if (!theirLanguage || !draft.trim() || busy) return;
    setTranslating(true);
    setDraftError(null);
    try {
      const asked = draft;
      const result = await translateText(asked, theirLanguage);
      // If they kept typing while this was in flight, their words win:
      // a translation of what they had a moment ago is not what they want.
      setDraft((current) => (current === asked ? result.text : current));
    } catch (err) {
      setDraftError(err instanceof ApiError ? err.message : 'Could not translate the draft.');
    } finally {
      setTranslating(false);
    }
  }

  async function askCopilot() {
    if (!draftSource || busy) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const asked = draft;
      const result = await draftReply(draftSource);
      // A draft that arrives after the person has started typing does not
      // get to throw their words away.
      setDraft((current) => (current === asked ? result.draft : current));
      setSources(result.sources);
      setSourcesOpen(false);
    } catch (err) {
      setDraftError(err instanceof ApiError ? err.message : 'Could not draft a reply.');
    } finally {
      setDrafting(false);
    }
  }

  // One status node, always mounted, whose words swap (the hint, then
  // "Sent"), so the change is announced; an error is an alert beside it and
  // the status steps aside (sr-only, empty) while it shows.
  // `||`, not `??`: an empty send error must not hide a draft error.
  const alertText = error || draftError;
  const status = (
    <>
      <span role="status" className={alertText ? 'sr-only' : sent ? 'text-[11px] leading-4 text-success-ink' : TYPE.meta}>
        {alertText ? '' : sent ? 'Sent from your mailbox.' : hint}
      </span>
      {alertText ? (
        <span role="alert" className="text-[11px] leading-4 text-danger-ink">
          {alertText}
        </span>
      ) : null}
    </>
  );

  return (
    <form
      className="shrink-0 px-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (onSend && draft.trim()) onSend(draft.trim());
      }}
    >
      <div className="overflow-hidden rounded-lg border border-line bg-surface focus-within:border-line-strong">
        <label htmlFor={id} className={`block px-3 pt-2 ${TYPE.label}`}>
          {label}
        </label>
        <textarea id={id} rows={sources.length ? 5 : 2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} className="w-full resize-none bg-transparent px-3 pt-1.5 pb-2.5 text-[13px] leading-5 text-ink outline-none" />
        {sources.length ? (
          <div className={`px-3 pb-2 ${TYPE.meta}`}>
            <span>{sources.length === 1 ? '1 source used' : `${sources.length} sources used`}</span>
            <button type="button" onClick={() => setSourcesOpen((o) => !o)} aria-expanded={sourcesOpen} className={`ml-2 inline-flex min-h-11 items-center gap-0.5 font-semibold text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`}>
              {sourcesOpen ? 'Hide sources' : 'View sources'}
              <ChevronDown className={`h-3 w-3 ${sourcesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {sourcesOpen ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {sources.map((source) => (
                  <li key={`${source.type}:${source.id}`}>
                    <Link to={hrefOf(source)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-md bg-subtle px-2 py-1 text-[11px] leading-4 text-ink hover:bg-line-subtle sm:min-h-0 ${FOCUS}`}>
                      <span className="font-semibold text-ink-muted">{source.type}</span>
                      <span className="truncate max-w-[220px]">{source.label}</span>
                      <span className="text-ink-muted">{source.date}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle px-3 py-2">
          {draftSource ? (
            <button type="button" onClick={askCopilot} disabled={busy} className={BUTTON}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {drafting ? 'Drafting…' : 'Draft with Copilot'}
            </button>
          ) : null}
          {theirLanguage ? (
            <button type="button" onClick={intoTheirLanguage} disabled={busy || draft.trim().length === 0} title={`Put this reply into ${languageName(theirLanguage)}`} className={BUTTON}>
              <Languages className="h-4 w-4" aria-hidden="true" />
              {translating ? 'Translating…' : `Write in ${languageName(theirLanguage)}`}
            </button>
          ) : null}
          {status}
          <span className="grow" />
          <button type="submit" disabled={!onSend || draft.trim().length === 0 || sending} title={onSend ? undefined : 'Not wired yet'} className={PRIMARY}>
            {sending ? 'Sending…' : sendLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

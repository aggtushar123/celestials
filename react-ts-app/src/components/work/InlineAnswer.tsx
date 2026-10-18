import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FEED, NEXT_UP, answeredText, threadHref } from '../../features/work/feed';
import { answerQuestion, readRefusal } from '../../features/work/workApi';
import type { QuestionFeedItem } from '../../features/work/workTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, INPUT, QUIET, TYPE } from '../ui';
import type { Settle } from './FeedDecideRows';

const ANSWER_BOX = `${INPUT} min-h-20 w-full`;

/** A question answered where it is shown (My work, the Team queue and Next
 *  up; the old Copilot sidebar's form, on tokens): Answer opens a box; Send
 *  answer posts it once, and the row leaves (the page's toast takes focus).
 *  A refusal shows under the box in the server's words; focus stays on Send
 *  answer (aria-disabled while it sends). A question on an organisation
 *  keeps a quiet link to its whole thread there. */
export function InlineAnswer({ item, onAnswered }: { item: QuestionFeedItem; onAnswered: (item: QuestionFeedItem, settle: Settle) => void }) {
  const boxId = useId();
  const errorId = useId();
  const openRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });

  useEffect(() => {
    if (open) textRef.current?.focus();
  }, [open]);

  async function send() {
    if (busy) return;
    if (!text.trim()) {
      setError(NEXT_UP.WRITE);
      return;
    }
    setError(null);
    const outcome = await run(() => answerQuestion(item.id, text.trim()));
    if (!outcome) return;
    if (outcome.ok) onAnswered(item, { text: answeredText(item.title) });
    else setError(readRefusal(outcome.error, NEXT_UP.ANSWER_FAILED).form ?? NEXT_UP.ANSWER_FAILED);
  }

  const thread = threadHref(item);
  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button ref={openRef} type="button" onClick={() => setOpen(true)} className={BUTTON}>
          {FEED.ANSWER}
        </button>
        {thread ? (
          <Link to={thread} className={QUIET}>
            {FEED.OPEN_THREAD}
          </Link>
        ) : null}
      </div>
    );
  return (
    <form
      id={boxId}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label className={TYPE.meta} htmlFor={`${boxId}-text`}>
        {`Answer ${item.detail.asked_by.name}`}
      </label>
      <textarea
        id={`${boxId}-text`}
        ref={textRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={ANSWER_BOX}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] leading-4 text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={busy || undefined} className={BUTTON}>
          {busy ? NEXT_UP.SENDING : NEXT_UP.SEND}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            requestAnimationFrame(() => openRef.current?.focus());
          }}
          className={QUIET}
        >
          {FEED.CANCEL}
        </button>
      </div>
    </form>
  );
}

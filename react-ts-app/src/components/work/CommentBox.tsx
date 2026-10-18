import { useId, useState, type FormEvent } from 'react';
import { isMissing, postComment, readRefusal } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TaskEvent } from '../../features/work/workTypes';
import { BUTTON } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Field } from '../rules/Field';

/** Add a comment (spec §1.5): anyone who can see the task may. Sent once;
 *  the new event joins the trail and the box clears. A 404 means the task
 *  is out of the reader's reach now (`onMissing`). */
export function CommentBox({ taskId, onAdded, onMissing }: { taskId: number; onAdded: (event: TaskEvent) => void; onMissing: () => void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) {
      setError(WORK.COMMENT_REQUIRED);
      return;
    }
    setError(null);
    const outcome = await run(() => postComment(taskId, body));
    if (!outcome) return;
    if (outcome.ok) {
      onAdded(outcome.value);
      setText('');
      return;
    }
    if (isMissing(outcome.error)) {
      onMissing();
      return;
    }
    const refusal = readRefusal(outcome.error, WORK.COMMENT_FAILED);
    setError(refusal.field.body ?? refusal.form ?? WORK.COMMENT_FAILED);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Field id={id} label={WORK.ADD_COMMENT} error={error ?? undefined}>
        {(aria) => (
          <textarea
            id={id}
            {...aria}
            rows={3}
            maxLength={5000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className={`${INPUT} py-2 ${error ? 'border-danger' : 'border-line'}`}
          />
        )}
      </Field>
      <div>
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? WORK.SENDING : WORK.COMMENT}
        </button>
      </div>
    </form>
  );
}

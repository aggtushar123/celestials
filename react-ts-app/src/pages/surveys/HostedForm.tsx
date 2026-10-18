import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { FOCUS, MONO, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { RevenactMark } from '../../components/shared/RevenactMark';
import { ScaleButtons } from '../../components/surveys/ScaleButtons';
import { ApiError } from '../../lib/apiClient';
import { COMMENT_MAX, LINK_DAYS, SCALES } from '../../features/surveys/questions';
import { answerPublicSurvey, fetchPublicSurvey } from '../../features/surveys/surveyApi';
import { answerErrors, THROTTLED, type AnswerErrors } from '../../features/surveys/surveyErrors';
import type { PublicSurvey } from '../../features/surveys/surveyTypes';

type View =
  | { status: 'loading' }
  | { status: 'live'; survey: PublicSurvey }
  | { status: 'thanks' }
  | { status: 'expired' }
  | { status: 'failed'; message: string };

/** /s/:token (spec §2.4): the customer's one-time form, outside the app
 *  frame and the signed-in guard. It reads no store and sends no session
 *  (plan Decision 6); App's ThemeSynchronizer keeps it light (Decision 5).
 *  Every bad link reads the same expired page. */
export function HostedForm() {
  const { token = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${token}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; view: View } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPublicSurvey(token).then(
      (survey) => {
        if (alive) setAnswer({ key, view: { status: 'live', survey } });
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) setAnswer({ key, view: { status: 'expired' } });
        else {
          const message = err instanceof ApiError && err.status === 429 ? THROTTLED : 'Could not open this survey. Check your connection and try again.';
          setAnswer({ key, view: { status: 'failed', message } });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [key, token]);

  const view: View = answer?.key === key ? answer.view : { status: 'loading' };
  return (
    <main className="flex min-h-[100dvh] w-full justify-center bg-base px-4 py-10 text-ink">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <RevenactMark withWordmark size="sm" />
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          {view.status === 'loading' ? (
            <div role="status" aria-label="Loading the survey" className="flex flex-col gap-3">
              <span className="block h-6 w-3/4 animate-pulse rounded bg-subtle" />
              <span className="block h-11 w-full animate-pulse rounded bg-subtle" />
            </div>
          ) : null}
          {view.status === 'live' ? <AnswerForm token={token} survey={view.survey} onDone={(next) => setAnswer({ key, view: next })} /> : null}
          {view.status === 'thanks' ? <Message title="Thanks, your answer was recorded." detail="You can close this page." /> : null}
          {view.status === 'expired' ? <Message title="This link has expired." detail={`Survey links work for ${LINK_DAYS} days and take one answer.`} /> : null}
          {view.status === 'failed' ? (
            <Message
              title="This survey didn't open"
              detail={view.message}
              action={
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} self-start border border-line`}>
                  Try again
                </button>
              }
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Message({ title, detail, action = null }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[22px] font-semibold text-ink">{title}</h1>
      <p className="text-[13px] text-ink-muted">{detail}</p>
      {action}
    </div>
  );
}

function AnswerForm({ token, survey, onDone }: { token: string; survey: PublicSurvey; onDone: (view: View) => void }) {
  const questionId = useId();
  const commentId = useId();
  const scoreErrorId = useId();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<AnswerErrors>({});
  const [sending, setSending] = useState(false);
  const [low, high] = SCALES[survey.survey_type];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (score === null) {
      setErrors({ score: `Choose a score from ${low} to ${high}.` });
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const text = comment.trim();
      await answerPublicSurvey(token, text ? { score, comment: text } : { score });
      onDone({ status: 'thanks' });
    } catch (err) {
      const found = answerErrors(err);
      if (found === 'expired') {
        onDone({ status: 'expired' });
        return;
      }
      setErrors(found);
      setSending(false);
    }
  }

  const describedBy = [`${commentId}-count`, errors.comment ? `${commentId}-error` : null].filter(Boolean).join(' ');
  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
      {survey.intro ? <p className="whitespace-pre-line break-words text-[13px] text-ink-muted">{survey.intro}</p> : null}
      <fieldset aria-labelledby={questionId} aria-describedby={errors.score ? scoreErrorId : undefined} className="flex flex-col gap-3">
        <h1 id={questionId} className="text-[22px] font-semibold text-ink">
          {survey.question}
        </h1>
        <ScaleButtons
          type={survey.survey_type}
          value={score}
          onChange={(next) => {
            setScore(next);
            setErrors((current) => ({ ...current, score: undefined }));
          }}
        />
        {errors.score ? (
          <p id={scoreErrorId} role="alert" className="text-[13px] text-danger">
            {errors.score}
          </p>
        ) : null}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={commentId} className="text-[13px] font-semibold text-ink">
          Anything to add? <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea
          id={commentId}
          rows={4}
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(event) => setComment(event.target.value)}
          aria-invalid={Boolean(errors.comment)}
          aria-describedby={describedBy}
          className={`min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-[15px] text-ink ${errors.comment ? 'border-danger' : 'border-line'} ${FOCUS}`}
        />
        <p id={`${commentId}-count`} className="text-right text-[11px] text-ink-muted">
          <span className={MONO}>{comment.length}</span> of <span className={MONO}>{COMMENT_MAX}</span>
        </p>
        {errors.comment ? (
          <p id={`${commentId}-error`} role="alert" className="text-[13px] text-danger">
            {errors.comment}
          </p>
        ) : null}
      </div>
      {errors.form ? (
        <p role="alert" className="text-[13px] text-danger">
          {errors.form}
        </p>
      ) : null}
      <button type="submit" disabled={sending} className={`${PRIMARY} self-start px-5`}>
        {sending ? 'Sending…' : 'Submit'}
      </button>
    </form>
  );
}

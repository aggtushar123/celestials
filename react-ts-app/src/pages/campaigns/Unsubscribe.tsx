import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { RevenactMark } from '../../components/shared/RevenactMark';
import { confirmUnsubscribe, fetchUnsubscribe } from '../../features/campaigns/campaignApi';
import { LINK_DAYS } from '../../features/campaigns/campaignOptions';
import { THROTTLED } from '../../features/surveys/surveyErrors';
import { ApiError } from '../../lib/apiClient';

type View =
  | { status: 'loading' }
  | { status: 'live'; workspace: string }
  | { status: 'done' }
  /** `clicked`: the button found it expired, so it is announced. */
  | { status: 'expired'; clicked?: boolean }
  | { status: 'failed'; message: string };

const OFFLINE = 'Could not open this link. Check your connection and try again.';

/** /u/:token (spec §2.4): a customer's one-click unsubscribe, outside the
 *  app frame and the signed-in guard. It reads no store and sends no
 *  session; App's ThemeSynchronizer keeps it light. Opening it changes
 *  nothing: only the button does, so link scanners unsubscribe nobody. */
export function Unsubscribe() {
  const { token = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${token}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; view: View } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchUnsubscribe(token).then(
      (link) => {
        if (alive) setAnswer({ key, view: { status: 'live', workspace: link.workspace } });
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) setAnswer({ key, view: { status: 'expired' } });
        else setAnswer({ key, view: { status: 'failed', message: err instanceof ApiError && err.status === 429 ? THROTTLED : OFFLINE } });
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
            <div role="status" aria-label="Opening the link" className="flex flex-col gap-3">
              <span className="block h-6 w-3/4 animate-pulse rounded bg-subtle" />
              <span className="block h-11 w-40 animate-pulse rounded bg-subtle" />
            </div>
          ) : null}
          {view.status === 'live' ? <Confirm token={token} workspace={view.workspace} onDone={(next) => setAnswer({ key, view: next })} /> : null}
          {view.status === 'done' ? <Message title="You're unsubscribed." detail="You won't get more of these emails." announce /> : null}
          {view.status === 'expired' ? <Message title="This link has expired." detail={`Unsubscribe links work for ${LINK_DAYS} days.`} announce={view.clicked} /> : null}
          {view.status === 'failed' ? (
            <Message
              title="This page didn't open"
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

/** `announce`: the outcome of the click, which unmounts the focused
 *  button. It is a live region and its heading takes focus, so a screen
 *  reader hears it and focus does not fall to the page. */
function Message({ title, detail, action = null, announce = false }: { title: string; detail: string; action?: ReactNode; announce?: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (announce) headingRef.current?.focus();
  }, [announce]);
  return (
    <div role={announce ? 'status' : undefined} className="flex flex-col gap-2">
      <h1 ref={headingRef} tabIndex={announce ? -1 : undefined} className={`text-[22px] font-semibold text-ink ${FOCUS}`}>
        {title}
      </h1>
      <p className="text-[13px] text-ink-muted">{detail}</p>
      {action}
    </div>
  );
}

function Confirm({ token, workspace, onDone }: { token: string; workspace: string; onDone: (view: View) => void }) {
  const submit = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function unsubscribe() {
    setError(null);
    const outcome = await submit.run(() => confirmUnsubscribe(token));
    if (!outcome) return;
    if (outcome.ok) {
      onDone({ status: 'done' });
      return;
    }
    const err = outcome.error;
    if (err instanceof ApiError && err.status === 404) {
      onDone({ status: 'expired', clicked: true });
      return;
    }
    setError(err instanceof ApiError && err.status === 429 ? THROTTLED : 'Could not unsubscribe you. Check your connection and try again.');
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[22px] font-semibold text-ink">Stop emails from {workspace}?</h1>
      <p className="text-[13px] text-ink-muted">You will stop getting campaign emails from {workspace}.</p>
      <button type="button" onClick={() => void unsubscribe()} disabled={submit.busy} className={`${PRIMARY} self-start px-5`}>
        {submit.busy ? 'Unsubscribing…' : 'Unsubscribe'}
      </button>
      {error ? (
        <p ref={errorRef} role="alert" data-error tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

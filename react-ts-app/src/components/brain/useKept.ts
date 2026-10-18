import { useEffect, useState } from 'react';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';

type Answer<T> = { attempt: number; value: T | null; error: string | null };

/** A kept AI text for one scope (a brief, an explanation), spec §2.3: read
 *  free on mount and on Try again; written only from a click, once however
 *  fast it is clicked (useSubmitOnce). A failed write keeps the old text and
 *  says why in the server's words; a 403 SCOPE_NOT_ALLOWED goes to
 *  `onRefused` instead. The caller keys the component by scope, so `read`
 *  and `write` are fixed for its life. */
export function useKept<T>({
  read,
  write,
  onRefused,
  readFallback,
  writeFallback,
}: {
  read: () => Promise<T | null>;
  write: () => Promise<T>;
  onRefused: (err: unknown) => boolean;
  readFallback: string;
  writeFallback: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer<T> | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();

  useEffect(() => {
    let alive = true;
    read().then(
      (value) => alive && setAnswer({ attempt, value, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ attempt, value: null, error: readFallback });
      },
    );
    return () => {
      alive = false;
    };
    // `read`, `onRefused` and `readFallback` are fixed for the component's life (keyed by scope).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  async function save() {
    setWriteError(null);
    const outcome = await run(write);
    if (!outcome) return;
    if (outcome.ok) setAnswer({ attempt, value: outcome.value, error: null });
    else if (!onRefused(outcome.error)) setWriteError(errorMessage(outcome.error, writeFallback));
  }

  const current = answer?.attempt === attempt ? answer : null;
  return {
    value: current ? current.value : undefined,
    loadError: current?.error ?? null,
    retry: () => setAttempt((n) => n + 1),
    save,
    writing: busy,
    writeError,
  };
}

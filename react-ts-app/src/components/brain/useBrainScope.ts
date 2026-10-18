import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchScopes, isScopeRefusal } from '../../features/brain/brainApi';
import { chooseScope, forgetScope, readStoredScope, storeScope, withoutScope } from '../../features/brain/brainScope';
import { SAY } from '../../features/brain/brainText';
import type { ScopeKey, ScopesPayload } from '../../features/brain/brainTypes';

export interface BrainScope {
  offered: ScopesPayload | null;
  /** Non-null only once ?scope= names an offered scope (Decision 2). */
  scope: ScopeKey | null;
  label: string;
  error: string | null;
  notice: string | null;
  retry: () => void;
  choose: (key: ScopeKey) => void;
  /** True when `err` was a 403 SCOPE_NOT_ALLOWED; the page then moves to the new default. */
  refused: (err: unknown) => boolean;
}

type Answer = { attempt: number; offered: ScopesPayload | null; error: string | null };

/** The Brain's scope (spec §2.2): the server's scopes, `?scope=`, the reader's
 *  last choice. The notice rides on the navigation's state, so it lasts until
 *  the reader picks a view and needs no state set in an effect. */
export function useBrainScope({ without }: { without?: ScopeKey } = {}): BrainScope {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    let alive = true;
    fetchScopes().then(
      (offered) => alive && setAnswer({ attempt, offered, error: null }),
      () => alive && setAnswer({ attempt, offered: null, error: SAY.LOAD_SCOPES }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const current = answer?.attempt === attempt ? answer : null;
  const fetched = current?.offered ?? null;
  const offered = useMemo(() => (fetched && without ? withoutScope(fetched, without) : fetched), [fetched, without]);
  const urlScope = params.get('scope');
  const notice = (location.state as { scopeLost?: boolean } | null)?.scopeLost ? SAY.LOST_ACCESS : null;
  // The left-out scope is neither a refused link nor a stale memory (Work › Team, delivery 2):
  // ?scope=<it> reads as no scope, and a remembered <it> stays remembered for Brain.
  const urlChoice = urlScope === without ? null : urlScope;
  const choice = useMemo(() => {
    if (!offered) return null;
    const stored = readStoredScope();
    return chooseScope(urlChoice, stored === without ? null : stored, offered);
  }, [offered, urlChoice, without]);

  // Doing plan Decision 2: other parameters (`?section=`) ride along. Read
  // through a ref, kept in step before the settle effect below runs, so `go`
  // and the callbacks built on it stay stable.
  const searchRef = useRef(location.search);
  useEffect(() => {
    searchRef.current = location.search;
  }, [location.search]);

  const go = useCallback(
    (key: ScopeKey | null, lost: boolean) => {
      const next = new URLSearchParams(searchRef.current);
      if (key) next.set('scope', key);
      else next.delete('scope');
      const search = next.toString();
      navigate({ search: search ? `?${search}` : '' }, { replace: true, state: lost ? { scopeLost: true } : null });
    },
    [navigate],
  );

  useEffect(() => {
    if (!choice) return;
    if (choice.dropStored) forgetScope();
    if (urlScope !== choice.key) go(choice.key, choice.urlRefused || notice !== null);
  }, [choice, urlScope, notice, go]);

  const choose = useCallback(
    (key: ScopeKey) => {
      storeScope(key);
      go(key, false);
    },
    [go],
  );

  const refused = useCallback(
    (err: unknown) => {
      if (!isScopeRefusal(err)) return false;
      forgetScope();
      go(null, true);
      setAttempt((n) => n + 1);
      return true;
    },
    [go],
  );

  const scope = choice && urlScope === choice.key ? choice.key : null;
  return {
    offered,
    scope,
    label: offered?.scopes.find((s) => s.key === scope)?.label ?? '',
    error: current?.error ?? null,
    notice,
    retry: () => setAttempt((n) => n + 1),
    choose,
    refused,
  };
}

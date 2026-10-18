// Where the backend sends the browser after a provider sign-in.
//
//   /auth/callback?handoff=<one-time code>   -> exchange it, then continue
//   /auth/callback?setup=<short-lived code>  -> the workspace form
//   /auth/callback?error=<CODE>              -> explain what to do next
//
// The hand-off code is single use and short lived, so it is exchanged once
// on mount and removed from the address bar immediately: a URL that lands
// in history, a bookmark or a shared screenshot must not carry anything
// that still works. The setup code is scrubbed the same way and kept in
// component state while the form is open.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, Clock, Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { loginWithHandoff } from '../../features/auth/authSlice';
import { authErrorMessage, isPendingApproval } from '../../features/auth/oauth';
import { RevenactMark } from '../../components/shared/RevenactMark';
import { WorkspaceSetup } from './WorkspaceSetup';
import './Login.css';

export function AuthCallback() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  const handoff = params.get('handoff');
  const redirectError = params.get('error');

  // Read once and kept here: the address bar is cleared below and must not
  // be the thing the form depends on.
  const [setup] = useState<string | null>(() => params.get('setup'));

  const [failureCode, setFailureCode] = useState<string | null>(redirectError);
  const onSetupUnusable = useCallback((code: string) => setFailureCode(code), []);
  // React runs effects twice in StrictMode, and a one-time code cannot be
  // spent twice, so the exchange is guarded rather than keyed on the value.
  const exchanged = useRef(false);

  useEffect(() => {
    if (!handoff || exchanged.current) return;
    exchanged.current = true;

    // Drop the code from the address bar before the network call returns,
    // so it never survives in history.
    window.history.replaceState({}, '', '/auth/callback');

    dispatch(loginWithHandoff(handoff))
      .unwrap()
      .then(() => navigate('/', { replace: true }))
      .catch((code: string) => setFailureCode(code));
  }, [handoff, dispatch, navigate]);

  useEffect(() => {
    if (setup) window.history.replaceState({}, '', '/auth/callback');
  }, [setup]);

  useEffect(() => {
    // Already signed in and nothing to do here: do not leave someone parked
    // on a blank screen.
    if (isAuthenticated && !handoff && !redirectError && !setup) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, handoff, redirectError, setup, navigate]);

  const working = Boolean(handoff) && failureCode === null;
  const settingUp = Boolean(setup) && !isAuthenticated && failureCode === null;

  return (
    <div className="auth-page">
      <main className="auth-card" aria-live="polite">
        <RevenactMark size="lg" className="mb-5" />

        {working && (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-ink-faint mb-3" aria-hidden="true" />
            <h1 className="text-[18px] font-semibold text-ink mb-1.5">Finishing sign-in</h1>
            <p className="text-[13px] text-ink-muted text-center">One moment.</p>
          </>
        )}

        {settingUp && <WorkspaceSetup setup={setup!} onUnusable={onSetupUnusable} />}

        {!working && isPendingApproval(failureCode) && (
          <>
            <span className="w-11 h-11 rounded-full bg-warning-dim text-warning flex items-center justify-center mb-4">
              <Clock className="w-5 h-5" aria-hidden="true" />
            </span>
            <h1 className="text-[18px] font-semibold text-ink mb-2 text-center">
              Waiting for approval
            </h1>
            <p className="text-[13px] text-ink-muted text-center leading-relaxed mb-6 max-w-[21rem]">
              {authErrorMessage(failureCode)}
            </p>
            <Link to="/login" className="auth-submit-btn text-center">
              Back to sign in
            </Link>
          </>
        )}

        {!working && failureCode !== null && !isPendingApproval(failureCode) && (
          <>
            <span className="w-11 h-11 rounded-full bg-danger-dim text-danger flex items-center justify-center mb-4">
              <AlertCircle className="w-5 h-5" aria-hidden="true" />
            </span>
            <h1 className="text-[18px] font-semibold text-ink mb-2 text-center">
              Could not sign you in
            </h1>
            <p className="text-[13px] text-ink-muted text-center leading-relaxed mb-6 max-w-[21rem]">
              {authErrorMessage(failureCode)}
            </p>
            <Link to="/login" className="auth-submit-btn text-center">
              Try again
            </Link>
          </>
        )}

        {!working && !settingUp && failureCode === null && !handoff && (
          <>
            <h1 className="text-[18px] font-semibold text-ink mb-2 text-center">
              Nothing to complete here
            </h1>
            <p className="text-[13px] text-ink-muted text-center leading-relaxed mb-6 max-w-[21rem]">
              Start a sign-in from the sign-in page.
            </p>
            <Link to="/login" className="auth-submit-btn text-center">
              Go to sign in
            </Link>
          </>
        )}
      </main>
    </div>
  );
}

export default AuthCallback;

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { login, loginWithMfa, clearError } from '../../features/auth/authSlice';
import { loginSchema } from '../../features/auth/loginSchema';
import {
  fetchOAuthProviders,
  startOAuth,
  authErrorMessage,
  errorCodeOf,
  type OAuthProvider,
} from '../../features/auth/oauth';
import { RevenactMark } from '../../components/shared/RevenactMark';
import { ProviderLogo } from './ProviderLogo';
import './Login.css';

export function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { isAuthenticated, isLoading, error, mfaChallenge } = useAppSelector((state) => state.auth);
  const [mfaCode, setMfaCode] = useState('');

  // Which "Continue with ..." buttons exist is the server's answer, not a
  // constant here: the backend returns an empty list when provider sign-in
  // is switched off, and this page then shows only the password form.
  const [providers, setProviders] = useState<OAuthProvider[] | null>(null);
  const [redirecting, setRedirecting] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    let cancelled = false;
    fetchOAuthProviders().then((list) => {
      if (cancelled) return;
      setProviders(list);
      // With no provider configured the password form is the only way in,
      // so open it rather than hiding it behind a toggle.
      if (list.length === 0) setShowEmailForm(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    // '/' rather than '/work' (the home page) so the root redirect decides
    // whether this person still owes the first-run tour.
    navigate(from && from !== '/login' ? from : '/', { replace: true });
  }, [isAuthenticated, navigate, location.state]);

  // Clearing on input means a failed attempt's message does not sit under a
  // field the person has since corrected. Keyed on the fields alone: with
  // `error` in the list, the effect would run the moment an error arrived
  // and clear it before anyone could read it. The extra dispatch on mount
  // is a no-op.
  useEffect(() => {
    dispatch(clearError());
  }, [email, password, dispatch]);

  async function handleProviderSignIn(provider: OAuthProvider) {
    setProviderError(null);
    setRedirecting(provider.key);
    try {
      // Leaving the SPA entirely is the point: the provider's consent screen
      // must be a real navigation, never an iframe or a popup we then read.
      window.location.assign(await startOAuth(provider.key));
    } catch (err) {
      setRedirecting(null);
      setProviderError(authErrorMessage(errorCodeOf(err)));
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors: { email?: string; password?: string } = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as 'email' | 'password';
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    dispatch(login({ email, password }));
  }

  const loadingProviders = providers === null;
  const hasProviders = (providers?.length ?? 0) > 0;

  // The password was accepted and a second factor is owed: the page becomes
  // the code form and nothing else, so there is no way to "go around" it.
  if (mfaChallenge) {
    return (
      <div className="auth-page">
        <main className="auth-card" aria-labelledby="auth-heading">
          <header className="flex flex-col items-center text-center mb-6">
            <RevenactMark size="lg" className="mb-4" />
            <h1 id="auth-heading" className="font-display text-[24px] tracking-tight text-ink mb-2">
              Enter your code
            </h1>
            <p className="text-[13px] text-ink-muted leading-relaxed max-w-[19rem]">
              The six-digit code from your authenticator app, or one of your recovery codes.
            </p>
          </header>

          {error && (
            <div
              role="alert"
              className="w-full mb-4 p-3 bg-danger-dim border border-danger/25 rounded-lg text-[12px] text-danger flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mfaCode.trim()) dispatch(loginWithMfa({ mfaToken: mfaChallenge, code: mfaCode.trim() }));
            }}
            noValidate
            className="w-full text-left space-y-3.5"
          >
            <div>
              <label htmlFor="auth-mfa-code" className="block text-[12px] font-medium text-ink mb-1.5">
                Code
              </label>
              <input
                id="auth-mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="auth-input font-mono-brand tracking-[0.2em]"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
              />
            </div>
            <button type="submit" className="auth-submit-btn" disabled={isLoading || !mfaCode.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Checking</span>
                </>
              ) : (
                <span>Continue</span>
              )}
            </button>
          </form>

          <p className="text-[11px] text-ink-faint leading-relaxed mt-6 text-center max-w-[20rem]">
            Lost the app and the recovery codes? Ask another Revenact staff member to reset your
            second factor.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <main className="auth-card" aria-labelledby="auth-heading">
        <header className="flex flex-col items-center text-center mb-7">
          <RevenactMark size="lg" className="mb-4" />
          <h1 id="auth-heading" className="font-display text-[26px] tracking-tight text-ink mb-2">
            Sign in to Revenact
          </h1>
          <p className="text-[13px] text-ink-muted leading-relaxed max-w-[19rem]">
            Your accounts, health scores and the conversations waiting on you, in one place.
          </p>
        </header>

        {(error || providerError) && (
          <div
            role="alert"
            className="w-full mb-4 p-3 bg-danger-dim border border-danger/25 rounded-lg text-[12px] text-danger flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
            <span>{providerError ?? error}</span>
          </div>
        )}

        {loadingProviders && (
          <div className="w-full space-y-2.5 mb-4" aria-hidden="true">
            <div className="auth-provider-skeleton" />
            <div className="auth-provider-skeleton" />
          </div>
        )}

        {hasProviders && (
          <div className="w-full space-y-2.5">
            {providers!.map((provider) => (
              <button
                key={provider.key}
                type="button"
                className="auth-provider-btn"
                onClick={() => handleProviderSignIn(provider)}
                disabled={redirecting !== null}
              >
                <ProviderLogo provider={provider.key} className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left">Continue with {provider.label}</span>
                {redirecting === provider.key && (
                  <Loader2 className="w-4 h-4 animate-spin text-ink-faint" aria-label="Redirecting" />
                )}
              </button>
            ))}
          </div>
        )}

        {hasProviders && (
          <div className="w-full my-4 flex items-center gap-3">
            <span className="flex-1 h-px bg-line" />
            <button
              type="button"
              onClick={() => setShowEmailForm((open) => !open)}
              aria-expanded={showEmailForm}
              aria-controls="auth-email-form"
              className="text-[11px] font-medium text-ink-faint hover:text-ink transition-colors px-1"
            >
              {showEmailForm ? 'Hide email sign-in' : 'Sign in with email'}
            </button>
            <span className="flex-1 h-px bg-line" />
          </div>
        )}

        {showEmailForm && (
          <form
            id="auth-email-form"
            onSubmit={handleSubmit}
            noValidate
            className="w-full text-left space-y-3.5"
          >
            <div>
              <label htmlFor="auth-email" className="block text-[12px] font-medium text-ink mb-1.5">
                Work email
              </label>
              <input
                id="auth-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
              />
              {fieldErrors.email && (
                <p id="auth-email-error" className="text-[11px] text-danger mt-1.5">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="auth-password" className="block text-[12px] font-medium text-ink">
                  Password
                </label>
                <button
                  type="button"
                  className="text-[11px] text-ink-muted hover:text-ink inline-flex items-center gap-1 transition-colors"
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
              />
              {fieldErrors.password && (
                <p id="auth-password-error" className="text-[11px] text-danger mt-1.5">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-[11px] text-ink-muted hover:text-ink transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Signing in</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>
          </form>
        )}

        <p className="text-[11px] text-ink-faint leading-relaxed mt-6 text-center max-w-[20rem]">
          New here? Continue with your work account. If your company already uses Revenact
          you will be sent to its administrator; if not, you will set up the workspace.
        </p>
      </main>
    </div>
  );
}

export default Login;

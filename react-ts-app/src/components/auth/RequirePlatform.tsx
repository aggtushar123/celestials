// Gates the internal portal. Two things must both be true: the person is
// Revenact staff (a superuser, belonging to no tenant) and this session
// passed a second factor (the access token carries `mfa: true`, which only
// the second-factor login mints). The backend enforces the same pair on
// every /platform/ call; this decides what to show, and says which half is
// missing rather than bouncing silently.

import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAppDispatch, useAppSelector, usePlatformAccess } from '../../hooks';
import { logout } from '../../features/auth/authSlice';

export function RequirePlatform({ children, requireMfa = true }: { children: React.ReactNode; requireMfa?: boolean }) {
  const { isStaff, mfaVerified, mfaEnrolled } = usePlatformAccess();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  // Sign out too: /login sends a signed-in person straight back here.
  const signInAgain = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to="/work" replace />;

  if (requireMfa && !mfaVerified) {
    return (
      <div className="min-h-screen rv-canvas flex items-center justify-center p-6">
        <div className="rv-card max-w-md w-full p-6 flex flex-col items-center text-center gap-3">
          <span className="w-11 h-11 rounded-full bg-warning-dim text-warning flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" aria-hidden="true" />
          </span>
          <h1 className="text-[18px] font-semibold text-ink">Two-factor authentication needed</h1>
          {mfaEnrolled ? (
            <>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                The platform portal needs a session that passed your second factor. Sign out and sign in again with a code from your authenticator app.
              </p>
              <button type="button" onClick={signInAgain} className="rv-pill-primary mt-1">
                Sign in again
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Platform access is for staff accounts with an authenticator app. Set one up on your account page, then sign in again.
              </p>
              <Link to="/platform/account" className="rv-pill-primary mt-1">
                Set up two-factor
              </Link>
            </>
          )}
          <button type="button" onClick={signInAgain} className="text-[12px] text-ink-muted hover:text-ink">
            Sign in as someone else
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

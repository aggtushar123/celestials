import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { confirmPasswordReset } from '../../features/auth/authSlice';
import { RevenactMark } from '../../components/shared/RevenactMark';
import './Login.css';

// Step 2 of the forgot-password flow. Reached from the link emailed by
// ForgotPassword's backend call — uid/token live in this page's own URL
// query string, not app state, since the link is opened cold (a new tab,
// possibly a different browser than the one that requested it).
export function ResetPassword() {
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const token = searchParams.get('token');
  const linkIsMissingParams = !uid || !token;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);

    if (newPassword.length < 8) {
      setFieldError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError('Passwords do not match');
      return;
    }

    setFieldError(null);
    setIsSubmitting(true);
    try {
      // Guarded by linkIsMissingParams below — the form only renders (and
      // so this handler only ever runs) when both are present.
      await dispatch(confirmPasswordReset({ uid: uid!, token: token!, newPassword })).unwrap();
      setSucceeded(true);
    } catch (err) {
      setServerError(typeof err === 'string' ? err : 'This reset link is invalid or has expired.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <RevenactMark size="lg" className="mb-5" />
        <div className="login-form-wrapper">
          {linkIsMissingParams ? (
            <>
              <h2>Invalid reset link</h2>
              <p className="auth-subtext">
                This link is missing its reset token. Request a new one from the login page.
              </p>
              <Link to="/forgot-password" className="login-btn login-btn-primary auth-link-btn">
                Request a new link
              </Link>
            </>
          ) : succeeded ? (
            <>
              <h2>Password reset</h2>
              <p className="auth-subtext">Your password has been changed. You can now log in with it.</p>
              <Link to="/login" className="login-btn login-btn-primary auth-link-btn">
                Back to Login
              </Link>
            </>
          ) : (
            <>
              <h2>Choose a new password</h2>

              {serverError && (
                <div className="server-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <div className="password-header">
                    <label htmlFor="reset-new-password">New password</label>
                    <button
                      type="button"
                      className="show-password-btn"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showPassword ? 'Hide Password' : 'Show Password'}
                    </button>
                  </div>
                  <div className="form-input-wrapper">
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      className={`form-input ${fieldError ? 'has-error' : ''}`}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setFieldError(null);
                      }}
                      autoComplete="new-password"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="reset-confirm-password">Confirm new password</label>
                  <div className="form-input-wrapper">
                    <input
                      id="reset-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      className={`form-input ${fieldError ? 'has-error' : ''}`}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFieldError(null);
                      }}
                      autoComplete="new-password"
                    />
                  </div>
                  {fieldError && (
                    <div className="field-error">
                      <AlertCircle className="w-3 h-3" />
                      {fieldError}
                    </div>
                  )}
                </div>

                <button type="submit" className="login-btn login-btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <div className="spinner" /> : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

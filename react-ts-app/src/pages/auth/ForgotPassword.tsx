import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod/v4';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { requestPasswordReset } from '../../features/auth/authSlice';
import { RevenactMark } from '../../components/shared/RevenactMark';
import './Login.css';

const emailSchema = z.email('Please enter a valid email address');

// Step 1 of the forgot-password flow. The backend always resolves 200
// regardless of whether the email matches an account (see
// API_CONTRACTS.md) — so a successful submit always shows the same "check
// your email" panel, never "email not found". That's deliberate on the
// backend's part to avoid leaking which emails are registered; mirroring
// it here rather than trying to special-case a "real" success keeps that
// property intact end to end.
export function ForgotPassword() {
  const dispatch = useAppDispatch();

  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);

    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setFieldError(result.error.issues[0].message);
      return;
    }

    setFieldError(null);
    setIsSubmitting(true);
    try {
      await dispatch(requestPasswordReset(email)).unwrap();
      setSubmitted(true);
    } catch (err) {
      setServerError(typeof err === 'string' ? err : 'Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <RevenactMark size="lg" className="mb-5" />
        <div className="login-form-wrapper">
          {submitted ? (
            <>
              <h2>Check your email</h2>
              <p className="auth-subtext">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset
                your password. It expires in 1 hour.
              </p>
              <Link to="/login" className="login-btn login-btn-primary auth-link-btn">
                Back to Login
              </Link>
            </>
          ) : (
            <>
              <h2>Forgot your password?</h2>
              <p className="auth-subtext">
                Enter the email you sign in with and we&apos;ll send you a link to reset it.
              </p>

              {serverError && (
                <div className="server-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {serverError}
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="forgot-email">Email</label>
                  <div className="form-input-wrapper">
                    <input
                      id="forgot-email"
                      type="email"
                      className={`form-input ${fieldError ? 'has-error' : ''}`}
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFieldError(null);
                      }}
                      autoComplete="email"
                      autoFocus
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
                  {isSubmitting ? <div className="spinner" /> : 'Send reset link'}
                </button>
              </form>

              <Link to="/login" className="back-to-login">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

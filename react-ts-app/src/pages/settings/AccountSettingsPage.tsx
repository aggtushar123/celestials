import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setTheme } from '../../features/settings/settingsSlice';
import { updateProfile } from '../../features/auth/authSlice';
import { PasswordSection, TwoFactorSection } from '../../components/settings/AccountSecurity';

/**
 * Account settings.
 *
 * The name fields write through `updateProfile` to `PATCH /auth/me/`, which is
 * the only profile write the backend accepts. Email is shown read-only for the
 * same reason: that endpoint does not take an address, so an editable field
 * would be a promise the API cannot keep. Changing the sign-in address needs an
 * admin on the Users page.
 *
 * Password lives here, not on the old Profile page, and only for people who
 * have one: `has_password` is false for someone who only ever signed in with
 * Google or Microsoft, and asking them for a "current password" would be a
 * question with no answer. They see how they sign in instead.
 */

/** The three localStorage keys the session lives in; see `authSlice`. */
const SESSION_KEYS = ['revenact_access_token', 'revenact_refresh_token', 'revenact_user'];

export function AccountSettingsPage() {
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector((state) => state.auth.user);
  const theme = useAppSelector((state) => state.settings.theme);

  const storedName = currentUser?.name ?? '';
  const nameParts = storedName.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(nameParts[0] ?? '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' '));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [clearedNotice, setClearedNotice] = useState(false);

  const email = currentUser?.email ?? '';
  const nextName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
  const isDirty = nextName !== storedName;
  const canSave = isDirty && nextName.length > 0 && status !== 'saving';

  // The avatar shows the person, so it follows what they are typing rather
  // than what is saved.
  const initial = (firstName.trim().charAt(0) || email.charAt(0) || '?').toUpperCase();

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      await dispatch(updateProfile({ name: nextName })).unwrap();
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setStatus('idle');
      setError(typeof err === 'string' ? err : 'Could not save your profile.');
    }
  };

  /**
   * Clears cached site data without signing the person out.
   *
   * The card promises the account is unaffected, so the three session keys are
   * put back. Clearing them outright would end the session, which is not what
   * "clear local data" means to anyone reading it.
   */
  const handleClearData = () => {
    try {
      const preserved = SESSION_KEYS.map((key) => [key, localStorage.getItem(key)] as const);
      localStorage.clear();
      for (const [key, value] of preserved) {
        if (value !== null) localStorage.setItem(key, value);
      }
      sessionStorage.clear();
    } catch {
      // Private windows and blocked site data throw on access. Nothing cached
      // means nothing to clear, so the message below is still true.
    }
    setClearedNotice(true);
    window.setTimeout(() => setClearedNotice(false), 2500);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="text-[13px] font-medium text-[var(--rv-text)]">Account</h1>

      {/* Profile */}
      <section className="rv-card p-5 flex flex-col gap-3.5" aria-labelledby="profile-heading">
        <div>
          <h2 id="profile-heading" className="text-[14px] font-bold text-[var(--rv-text)]">
            Profile
          </h2>
          <p className="text-[12px] text-[var(--rv-text-muted)] mt-0.5">
            Your personal details and preferences.
          </p>
        </div>

        <div className="h-px bg-[var(--rv-card-border)] -mx-5 my-0.5" />

        <div className="flex items-start gap-4 pt-1">
          <div
            className="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center text-xl font-bold shrink-0 select-none"
            aria-hidden="true"
          >
            {initial}
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="first-name" className="text-[11.5px] text-[var(--rv-text-muted)]">
                First name
              </label>
              <input
                id="first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rv-input text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="last-name" className="text-[11.5px] text-[var(--rv-text-muted)]">
                Last name
              </label>
              <input
                id="last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rv-input text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 mt-1">
          <label htmlFor="account-email" className="text-[11.5px] text-[var(--rv-text-muted)]">
            Email
          </label>
          <input
            id="account-email"
            type="email"
            value={email}
            readOnly
            aria-describedby="email-hint"
            className="rv-input text-[12.5px] opacity-70 cursor-not-allowed"
          />
          <p id="email-hint" className="text-[11px] text-[var(--rv-text-muted)]">
            Your sign-in address. An admin can change it in Settings › People &amp; teams.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rv-pill-primary disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {status === 'saving' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Saving
              </>
            ) : (
              'Save changes'
            )}
          </button>
          {status === 'saved' && (
            <span role="status" className="text-[11.5px] font-medium text-success">
              Profile saved.
            </span>
          )}
          {error && (
            <span role="alert" className="text-[11.5px] font-medium text-danger">
              {error}
            </span>
          )}
        </div>
      </section>

      {/* Sign-in */}
      <PasswordSection />

      {/* Two-factor */}
      <TwoFactorSection enrolled={currentUser?.mfa_enrolled === true} isStaff={currentUser?.is_superuser === true} />

      {/* Appearance */}
      <section className="rv-card p-5 flex flex-col gap-3" aria-labelledby="appearance-heading">
        <div>
          <h2 id="appearance-heading" className="text-[14px] font-bold text-[var(--rv-text)]">
            Appearance
          </h2>
          <p className="text-[12px] text-[var(--rv-text-muted)] mt-0.5">
            Choose how Revenact looks to you.
          </p>
        </div>

        <div className="pt-0.5">
          <div
            role="radiogroup"
            aria-labelledby="appearance-heading"
            className="inline-flex bg-[var(--rv-pill-secondary-bg)] p-1 rounded-lg border border-[var(--rv-card-border)]"
          >
            {(['light', 'dark', 'system'] as const).map((mode) => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => dispatch(setTheme(mode))}
                  className={`px-3 py-1 rounded-md text-[11.5px] font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    active
                      ? 'bg-[var(--rv-pill-primary-bg)] text-[var(--rv-pill-primary-text)] font-semibold'
                      : 'text-[var(--rv-text-muted)] hover:text-[var(--rv-text)]'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Timezone */}
      <section className="rv-card p-5 flex flex-col gap-3" aria-labelledby="timezone-heading">
        <div>
          <h2 id="timezone-heading" className="text-[14px] font-bold text-[var(--rv-text)]">
            Timezone
          </h2>
          <p className="text-[12px] text-[var(--rv-text-muted)] mt-0.5">
            The timezone your calendar displays. Automatic follows your device.
          </p>
        </div>

        <div className="pt-0.5 flex items-center gap-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--rv-input-bg)] border border-[var(--rv-input-border)] text-[12px] font-medium text-[var(--rv-text)]">
            <Globe className="w-3.5 h-3.5 text-[var(--rv-text-muted)]" aria-hidden="true" />
            {/* Read from the browser rather than hardcoded, so it is true on
                every machine that opens this page. */}
            <span>Automatic &middot; {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </div>
        </div>
      </section>

      {/* Data & Storage */}
      <section className="rv-card p-5 flex flex-col gap-3" aria-labelledby="data-heading">
        <div>
          <h2 id="data-heading" className="text-[14px] font-bold text-[var(--rv-text)]">
            Data and storage
          </h2>
          <p className="text-[12px] text-[var(--rv-text-muted)] mt-0.5">
            Clear cached site data. You stay signed in, and nothing on the server is affected.
          </p>
        </div>

        <div className="pt-0.5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleClearData}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--rv-input-bg)] hover:bg-[var(--rv-pill-secondary-bg)] border border-[var(--rv-input-border)] text-[12px] font-medium text-[var(--rv-text)] transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Clear cached data
          </button>

          {clearedNotice && (
            <span role="status" className="text-[11px] text-success font-medium">
              Cached data cleared.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

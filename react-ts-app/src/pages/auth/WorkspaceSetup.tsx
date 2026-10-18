// The company-name screen.
//
// Shown when a provider has vouched for someone whose email domain nobody
// has claimed. They are not signed in yet: what they hold is a short-lived
// setup code, and this form is the only thing it is good for. Submitting
// creates the organisation with them as its first administrator and lands
// them in the app with a session; closing the tab leaves nothing behind.
//
// The rules that make an early employee harmless (a claim is not ownership,
// proof of DNS supersedes it, colleagues are routed here rather than given a
// second workspace) live in the backend. This page only has to be honest
// about what it is creating.

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Building2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { createWorkspace } from '../../features/auth/authSlice';
import {
  previewWorkspace,
  authErrorMessage,
  errorCodeOf,
  type WorkspacePreview,
} from '../../features/auth/oauth';

interface WorkspaceSetupProps {
  setup: string;
  /** Called with the error code when the code turns out to be unusable, so
   * the callback page can show its own screen. */
  onUnusable: (code: string) => void;
}

export function WorkspaceSetup({ setup, onUnusable }: WorkspaceSetupProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isLoading = useAppSelector((state) => state.auth.isLoading);

  const [preview, setPreview] = useState<WorkspacePreview | null>(null);
  const [organisationName, setOrganisationName] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    previewWorkspace(setup)
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        setOrganisationName(data.suggested_organisation_name);
        setName(data.name);
      })
      .catch((err) => {
        if (!cancelled) onUnusable(errorCodeOf(err) ?? 'INVALID_SETUP');
      });
    return () => {
      cancelled = true;
    };
  }, [setup, onUnusable]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = organisationName.trim();
    if (!trimmed) {
      setError(authErrorMessage('INVALID_ORGANISATION_NAME'));
      return;
    }
    try {
      await dispatch(createWorkspace({ setup, organisationName: trimmed, name: name.trim() })).unwrap();
      navigate('/', { replace: true });
    } catch (code) {
      const failure = typeof code === 'string' ? code : 'INVALID_SETUP';
      // A spent code or a domain claimed in the meantime cannot be fixed by
      // retyping: hand the page back so it can say what to do next.
      if (failure === 'INVALID_SETUP' || failure === 'WORKSPACE_CLAIMED') {
        onUnusable(failure);
        return;
      }
      setError(authErrorMessage(failure));
    }
  }

  if (preview === null) {
    return (
      <>
        <Loader2 className="w-5 h-5 animate-spin text-ink-faint mb-3" aria-hidden="true" />
        <p className="text-[13px] text-ink-muted text-center">One moment.</p>
      </>
    );
  }

  return (
    <>
      <span className="w-11 h-11 rounded-full bg-accent-dim text-ink flex items-center justify-center mb-4">
        <Building2 className="w-5 h-5" aria-hidden="true" />
      </span>
      <h1 id="auth-heading" className="font-display text-[24px] tracking-tight text-ink mb-2 text-center">
        Set up your workspace
      </h1>
      <p className="text-[13px] text-ink-muted text-center leading-relaxed mb-6 max-w-[22rem]">
        Nobody at <strong className="text-ink font-medium">{preview.domain}</strong> uses Revenact yet.
        You will be its first administrator, signed in as{' '}
        <span className="text-ink">{preview.email}</span>.
      </p>

      {error && (
        <div
          role="alert"
          className="w-full mb-4 p-3 bg-danger-dim border border-danger/25 rounded-lg text-[12px] text-danger flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="w-full text-left space-y-3.5">
        <div>
          <label htmlFor="workspace-name" className="block text-[12px] font-medium text-ink mb-1.5">
            Company name
          </label>
          <input
            id="workspace-name"
            type="text"
            className="auth-input"
            value={organisationName}
            onChange={(e) => setOrganisationName(e.target.value)}
            autoComplete="organization"
            autoFocus
            maxLength={255}
          />
        </div>

        <div>
          <label htmlFor="workspace-your-name" className="block text-[12px] font-medium text-ink mb-1.5">
            Your name
          </label>
          <input
            id="workspace-your-name"
            type="text"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={255}
          />
        </div>

        <button type="submit" className="auth-submit-btn" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Creating your workspace</span>
            </>
          ) : (
            <span>Create workspace</span>
          )}
        </button>
      </form>

      <p className="text-[11px] text-ink-faint leading-relaxed mt-6 text-center max-w-[20rem]">
        Colleagues who sign in with a {preview.domain} address will ask to join, and you decide.
        Verify the domain in Settings and they will be routed to you automatically.
      </p>
    </>
  );
}

export default WorkspaceSetup;

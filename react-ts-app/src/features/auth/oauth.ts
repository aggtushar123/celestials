// "Continue with Google / Microsoft" — the client half of the three
// endpoints in revenact-backend's services/identity/views.py:
//
//   GET  /auth/oauth/providers/          -> { providers: [{key, label}] }
//   POST /auth/oauth/<key>/start/        -> { authorize_url }
//   POST /auth/oauth/exchange/           -> { access, refresh, user }
//   POST /auth/oauth/workspace/preview/  -> { email, name, domain, ... }
//   POST /auth/oauth/workspace/          -> { access, refresh, user }  (authSlice)
//
// The browser never sees a token in a URL. The provider returns to the
// backend, which redirects here with a one-time hand-off code that is
// traded for a session over POST. Nothing in this file decides whether a
// person may sign in; the backend does, and reports why in `error.code`.

import { apiFetch, ApiError } from '../../lib/apiClient';

export interface OAuthProvider {
  key: string;
  label: string;
}

/** Which buttons the sign-in page should show.
 *
 * An empty list is the normal answer when AUTH_V2_ENABLED is off or no
 * client is configured, so the page quietly falls back to the password
 * form rather than advertising a half-built feature. A network failure
 * resolves the same way for the same reason. */
export async function fetchOAuthProviders(): Promise<OAuthProvider[]> {
  try {
    const data = await apiFetch<{ providers: OAuthProvider[] }>('/auth/oauth/providers/', {
      accessToken: null,
      skipAuthRetry: true,
    });
    return data.providers ?? [];
  } catch {
    return [];
  }
}

/** Where to send the browser to begin a sign-in. */
export async function startOAuth(providerKey: string): Promise<string> {
  const data = await apiFetch<{ authorize_url: string }>(`/auth/oauth/${providerKey}/start/`, {
    method: 'POST',
    accessToken: null,
    skipAuthRetry: true,
  });
  return data.authorize_url;
}

export interface WorkspacePreview {
  email: string;
  name: string;
  domain: string;
  suggested_organisation_name: string;
}

/** Who is about to set up a workspace, from the setup code the callback
 * arrived with. Does not spend the code, so a reload keeps the form. */
export async function previewWorkspace(setup: string): Promise<WorkspacePreview> {
  return apiFetch<WorkspacePreview>('/auth/oauth/workspace/preview/', {
    method: 'POST',
    body: { setup },
    accessToken: null,
    skipAuthRetry: true,
  });
}

/** The code the backend puts in `error=` on a failed callback.
 *
 * Kept as a plain string union rather than an enum because it arrives as
 * text off a query string; `authErrorMessage` handles anything unknown. */
export type AuthErrorCode =
  | 'ACCESS_REQUEST_PENDING'
  | 'DOMAIN_NOT_VERIFIED'
  | 'PERSONAL_EMAIL_NOT_SUPPORTED'
  | 'ORGANIZATION_SUSPENDED'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_DISABLED'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_NOT_AVAILABLE'
  | 'INVALID_STATE'
  | 'STATE_EXPIRED'
  | 'INVALID_HANDOFF'
  | 'INVALID_SETUP'
  | 'WORKSPACE_CLAIMED'
  | 'INVALID_ORGANISATION_NAME';

/** Every code is spelled out here so a person is told what to do next
 * rather than shown an identifier. The wording deliberately avoids
 * confirming whether an address exists (see API_CONTRACTS.md). */
const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  ACCESS_REQUEST_PENDING:
    'Your request to join is waiting for an administrator to approve it. You will be able to sign in once they do.',
  DOMAIN_NOT_VERIFIED:
    'No organisation here has verified that email domain yet. Ask your administrator to add and verify it, or to invite you directly.',
  PERSONAL_EMAIL_NOT_SUPPORTED:
    'Use your work address. A personal mailbox cannot be matched to an organisation, so you need an invitation instead.',
  ORGANIZATION_SUSPENDED: 'Your organisation is not active. Contact your administrator.',
  EMAIL_NOT_VERIFIED: 'Your provider has not verified that address yet. Verify it with them, then try again.',
  ACCOUNT_DISABLED: 'This account has been deactivated. Contact your administrator.',
  PROVIDER_REJECTED: 'Sign-in was cancelled before it finished. You can try again.',
  PROVIDER_NOT_AVAILABLE: 'That sign-in method is not enabled. Use your email and password instead.',
  INVALID_STATE: 'That sign-in link could not be verified. Start again from this page.',
  STATE_EXPIRED: 'That sign-in attempt took too long and has expired. Start again from this page.',
  INVALID_HANDOFF: 'That sign-in link has already been used or has expired. Start again from this page.',
  INVALID_SETUP: 'That set-up session has expired. Sign in again to start over.',
  WORKSPACE_CLAIMED:
    'Someone at your company has already started a workspace. Sign in again and you will be sent to it, where they can approve you.',
  INVALID_ORGANISATION_NAME: 'Give your workspace a name.',
};

/** Turns whatever came back into something a person can act on. */
export function authErrorMessage(code: string | null | undefined): string {
  if (!code) return 'Sign-in did not complete. Please try again.';
  return (
    AUTH_ERROR_MESSAGES[code as AuthErrorCode] ??
    'Sign-in did not complete. Please try again, or contact your administrator.'
  );
}

/** True when the only thing standing between the person and access is an
 * administrator's decision — the one failure that deserves its own screen
 * rather than a red box. */
export function isPendingApproval(code: string | null | undefined): boolean {
  return code === 'ACCESS_REQUEST_PENDING';
}

/** The code off an ApiError body, when the backend sent the structured
 * `{ success: false, error: { code, message } }` shape. */
export function errorCodeOf(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { error?: { code?: string } } | undefined;
  return body?.error?.code ?? null;
}

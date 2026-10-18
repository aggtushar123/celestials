// Thin fetch wrapper for revenact-backend's /api/v1/ — see
// revenact-backend/docs/API_CONTRACTS.md for the response/error shapes
// this follows.

// Same origin unless VITE_API_URL says otherwise: production serves the SPA
// and the API from one host (Caddy), and CI runs the tests without a .env.
export const API_ORIGIN = import.meta.env.VITE_API_URL || window.location.origin;
const BASE_URL = `${API_ORIGIN}/api/v1`;

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** A response that arrived after the session it was asked for ended (sign-out,
 *  or someone else signing in). It is dropped, not shown: callers must not
 *  render it as a failure or write it anywhere. */
export class SessionChangedError extends Error {
  constructor() {
    super('The session changed before this answered.');
    this.name = 'SessionChangedError';
  }
}

// Bumped when the session ends (see sessionGuard in store.ts). A request
// remembers the number it started under and is dropped if it moved.
let sessionGeneration = 0;

export function endSession() {
  sessionGeneration += 1;
}

function stillSame(started: number) {
  if (started !== sessionGeneration) throw new SessionChangedError();
}

// Wired up once at app startup (see store.ts) so this module can attach/
// refresh tokens without importing the store or authSlice directly — that
// would create an import cycle, since authSlice's thunks call apiFetch.
interface AuthHooks {
  getAccessToken: () => string | null;
  /** Exchanges the stored refresh token for a new access token, or null if
   * refresh isn't possible (no refresh token, or it's dead too). */
  refreshAccessToken: () => Promise<string | null>;
  /** The session is unrecoverable (refresh failed) — clear it. */
  onAuthFailure: () => void;
}

let authHooks: AuthHooks | null = null;

export function setAuthHooks(hooks: AuthHooks) {
  authHooks = hooks;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** A multipart body (file uploads). Sent as-is; the browser sets the
   * boundary, so no Content-Type header is added. */
  formData?: FormData;
  accessToken?: string | null;
  /** Skip the auto-refresh-on-401 retry. Used by the auth endpoints
   * themselves (login/refresh/logout) — a 401 from them means "bad
   * credentials" or "this specific token is dead", never "attach a
   * different token and retry", and retrying /token/refresh/ on its own
   * 401 would recurse forever. */
  skipAuthRetry?: boolean;
  /** `'include'` sends and stores cookies on a cross-origin call (local dev
   * runs the SPA on :5173 and the API on :8000). Only the mail OAuth
   * connect needs it: its answer sets a cookie that binds the flow to this
   * browser. Everything else authenticates by bearer token alone. */
  credentials?: RequestCredentials;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.accessToken !== undefined ? options.accessToken : (authHooks?.getAccessToken() ?? null);
  let started = sessionGeneration;
  let response = await rawFetch(path, options, token);
  stillSame(started);

  if (response.status === 401 && !options.skipAuthRetry && authHooks) {
    const newToken = await authHooks.refreshAccessToken();
    // A failed refresh may itself have ended the session (the real store
    // does): that must not skip onAuthFailure below, which resets the slices.
    if (newToken) stillSame(started);
    if (newToken) {
      response = await rawFetch(path, options, newToken);
      stillSame(started);
    }
    if (response.status === 401) {
      authHooks.onAuthFailure();
      // This request's own 401 ended the session: it still answers as a 401.
      started = sessionGeneration;
    }
  }

  const parsed = await parseResponse<T>(response).then(
    (data) => ({ data }),
    (error: unknown) => ({ error }),
  );
  stillSame(started);
  if ('error' in parsed) throw parsed.error;
  return parsed.data;
}

/** The full URL for an API path: DRF's absolute `next` links go through as
 *  they are; a server-given `/api/v1/...` path is prefixed once (D2 Decision 11). */
function urlOf(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const relative = path.startsWith('/api/v1/') ? path.slice('/api/v1'.length) : path;
  return `${BASE_URL}${relative}`;
}

function rawFetch(path: string, options: RequestOptions, token: string | null) {
  const headers: Record<string, string> = options.formData ? {} : { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  // DRF's pagination `next`/`previous` links are full absolute URLs (they
  // include the scheme/host already) — pass those through as-is instead of
  // prefixing with BASE_URL again.
  return fetch(urlOf(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    ...(options.credentials ? { credentials: options.credentials } : {}),
  });
}

/** One multipart POST over XMLHttpRequest, which (unlike fetch) reports upload progress. */
function xhrPost(path: string, form: FormData, token: string | null, onProgress?: (fraction: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', urlOf(path));
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new TypeError('Failed to fetch'));
    xhr.send(form);
  });
}

/** A file upload with progress (two-way Gmail D3, Decision 9): the same
 *  token, refresh-once and session rules as apiFetch. */
export async function apiUpload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  const token = authHooks?.getAccessToken() ?? null;
  const started = sessionGeneration;
  let answer = await xhrPost(path, form, token, onProgress);
  stillSame(started);
  if (answer.status === 401 && authHooks) {
    const newToken = await authHooks.refreshAccessToken();
    if (newToken) stillSame(started);
    if (newToken) {
      answer = await xhrPost(path, form, newToken, onProgress);
      stillSame(started);
    }
    if (answer.status === 401) authHooks.onAuthFailure();
  }
  if (answer.status < 200 || answer.status >= 300) throw new ApiError(answer.status, answer.body, extractErrorMessage(answer.body) ?? `Request failed (${answer.status})`);
  return answer.body as T;
}

/** Fetch a file the API serves as an attachment (Files tab downloads):
 * the same auth handling as apiFetch, but the body comes back as a Blob. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = authHooks?.getAccessToken() ?? null;
  let started = sessionGeneration;
  let response = await rawFetch(path, {}, token);
  stillSame(started);
  if (response.status === 401 && authHooks) {
    const newToken = await authHooks.refreshAccessToken();
    if (newToken) stillSame(started);
    if (newToken) {
      response = await rawFetch(path, {}, newToken);
      stillSame(started);
    }
    if (response.status === 401) {
      authHooks.onAuthFailure();
      started = sessionGeneration;
    }
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    stillSame(started);
    throw new ApiError(response.status, data, extractErrorMessage(data) ?? `Request failed (${response.status})`);
  }
  const blob = await response.blob();
  stillSame(started);
  return blob;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data, extractErrorMessage(data) ?? `Request failed (${response.status})`);
  }

  return data as T;
}

// DRF error shapes: {"detail": "..."}, field-level
// {"field_name": ["message", ...]}, or a bare ["message", ...] array —
// that last one is what `raise ValidationError("…")` from a view body
// produces (as opposed to from a serializer, which DRF wraps in
// {"non_field_errors": [...]}). Pick out one human-readable message.
//
// Without the array case, every such error rendered as the useless
// "Request failed (400)" instead of the real reason — which is exactly
// what a user hits when a guardrail refuses their action.
function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;

  if (Array.isArray(body)) {
    return typeof body[0] === 'string' ? body[0] : null;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;

  const firstFieldErrors = Object.values(record)[0];
  if (Array.isArray(firstFieldErrors) && typeof firstFieldErrors[0] === 'string') {
    return firstFieldErrors[0];
  }
  return null;
}

interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Walks every page of a paginated (DRF-style {count,next,previous,results})
// endpoint — extracted from SettingsPage.tsx, which was the first caller to
// need "every record, not just the first page" (Usage% needs the real,
// whole-tenant fill rate). Not every list endpoint is paginated this way —
// Opportunity/Risk/Scenario return a plain array (see those views' own
// docstrings on why) — for those, call apiFetch<T[]> directly instead.
export async function fetchAllPages<T>(endpoint: string): Promise<T[]> {
  const all: T[] = [];
  let url: string | undefined = endpoint;
  while (url) {
    const page: Page<T> = await apiFetch<Page<T>>(url);
    all.push(...page.results);
    url = page.next ?? undefined;
  }
  return all;
}

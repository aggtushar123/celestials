// Thin apiFetch wrappers over revenact-backend's /api/v1/surveys/sends/ and
// the public /api/v1/public/surveys/<token>/ (backend plan Task 11).
import { apiFetch } from '../../lib/apiClient';
import type {
  AnswersFilter,
  AnswersPage,
  AudienceCounts,
  AudienceRequest,
  PendingPage,
  PublicAnswer,
  PublicSurvey,
  SendListRow,
  SendWrite,
  SurveySend,
} from './surveyTypes';

export const SENDS_PATH = '/surveys/sends/';
const one = (id: number) => `${SENDS_PATH}${id}/`;

/** Every send the reader may read, newest first, unpaginated. */
export function fetchSends(): Promise<SendListRow[]> {
  return apiFetch<SendListRow[]>(SENDS_PATH);
}

export function fetchSend(id: number): Promise<SurveySend> {
  return apiFetch<SurveySend>(one(id));
}

/** A draft owned by the caller (201). */
export function createSend(body: SendWrite): Promise<SurveySend> {
  return apiFetch<SurveySend>(SENDS_PATH, { method: 'POST', body });
}

/** Owner only. After the send, only name, sharing and shared_with. */
export function updateSend(id: number, body: Partial<SendWrite>): Promise<SurveySend> {
  return apiFetch<SurveySend>(one(id), { method: 'PATCH', body });
}

/** Owner only, drafts only (409 otherwise). */
export function deleteSend(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

/** Who `{segment, roles}` reaches, resolved on the server from the caller's
 *  own view. Nothing is created. */
export function fetchAudience(body: AudienceRequest): Promise<AudienceCounts> {
  return apiFetch<AudienceCounts>(`${SENDS_PATH}audience/`, { method: 'POST', body });
}

/** The real send: resolves the audience again on the server and emails
 *  each person their link. Returns the sent survey. */
export function sendNow(id: number): Promise<SurveySend> {
  return apiFetch<SurveySend>(`${one(id)}send/`, { method: 'POST' });
}

/** `filter` is sent only when not `all`; `cursor` is passed through as the
 *  server gave it. */
export function fetchAnswers(id: number, filter: AnswersFilter, cursor: string | null): Promise<AnswersPage> {
  const query = new URLSearchParams();
  if (filter !== 'all') query.set('filter', filter);
  if (cursor) query.set('cursor', cursor);
  const text = query.toString();
  return apiFetch<AnswersPage>(text ? `${one(id)}answers/?${text}` : `${one(id)}answers/`);
}

export function fetchPending(id: number): Promise<PendingPage> {
  return apiFetch<PendingPage>(`${one(id)}pending/`);
}

/** The public link carries no session (plan Decision 6): no token is
 *  attached, and a 401 never refreshes or signs anyone out. */
const NO_SESSION = { accessToken: null, skipAuthRetry: true } as const;
const link = (token: string) => `/public/surveys/${encodeURIComponent(token)}/`;

export function fetchPublicSurvey(token: string): Promise<PublicSurvey> {
  return apiFetch<PublicSurvey>(link(token), NO_SESSION);
}

/** 204 on success; every bad link is a 404 "This link has expired." */
export function answerPublicSurvey(token: string, body: PublicAnswer): Promise<null> {
  return apiFetch<null>(link(token), { ...NO_SESSION, method: 'POST', body });
}

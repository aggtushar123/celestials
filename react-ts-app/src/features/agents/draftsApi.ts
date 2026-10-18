// Thin apiFetch wrappers over /api/v1/communications/drafts/ (Agents
// delivery 2 contract, "Reply drafts"). Refusals are read with agentsApi's
// refusalCode and refusalDetail; field errors with draftFieldErrors. No em dash.
import { ApiError, apiFetch } from '../../lib/apiClient';
import type { DraftFilters, DraftPatch, DraftSent, DraftsList, ReplyDraft } from './draftTypes';

export const DRAFTS_PATH = '/communications/drafts/';
const one = (id: number) => `${DRAFTS_PATH}${id}/`;

export function draftsQuery(filters: DraftFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.channel) params.set('channel', filters.channel);
  if (filters.status) params.set('status', filters.status);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const listDrafts = (filters: DraftFilters = {}) => apiFetch<DraftsList>(`${DRAFTS_PATH}${draftsQuery(filters)}`);
/** 404 unless the reader owns it, or may open its record and read its source. */
export const fetchDraft = (id: number) => apiFetch<ReplyDraft>(one(id));
export const saveDraft = (id: number, patch: DraftPatch) => apiFetch<ReplyDraft>(one(id), { method: 'PATCH', body: patch });
/** Email only; `patch` is saved first with the PATCH rules. */
export const sendDraft = (id: number, patch: DraftPatch = {}) => apiFetch<DraftSent>(`${one(id)}send/`, { method: 'POST', body: patch });
/** Ticket only. */
export const markDraftSent = (id: number) => apiFetch<ReplyDraft>(`${one(id)}mark-sent/`, { method: 'POST' });
/** Unconfirmed send, owner says it went: 200 sent; 409 NOT_UNCONFIRMED otherwise. */
export const confirmDraftSent = (id: number) => apiFetch<ReplyDraft>(`${one(id)}confirm-sent/`, { method: 'POST' });
/** Unconfirmed send, owner says it did not: 200 open again; 409 NOT_UNCONFIRMED otherwise. */
export const reopenDraft = (id: number) => apiFetch<ReplyDraft>(`${one(id)}reopen/`, { method: 'POST' });
/** 204. */
export const discardDraft = (id: number) => apiFetch<null>(one(id), { method: 'DELETE' });

export type DraftField = 'body' | 'subject';

/** A 400's field errors, in the server's words. */
export function draftFieldErrors(err: unknown): Partial<Record<DraftField, string>> {
  if (!(err instanceof ApiError) || err.status !== 400 || typeof err.body !== 'object' || err.body === null) return {};
  const body = err.body as Record<string, unknown>;
  const out: Partial<Record<DraftField, string>> = {};
  for (const field of ['body', 'subject'] as const) {
    const value = body[field];
    if (Array.isArray(value) && typeof value[0] === 'string') out[field] = value[0];
  }
  return out;
}

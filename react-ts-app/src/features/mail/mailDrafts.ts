// Two-way Gmail, delivery 3: the draft, compose and search wire shapes and
// their calls (contract revenact-backend
// docs/superpowers/plans/2026-10-11-gmail-writing-api.md §2, §3, §4, §6),
// and the small rules around them. No React here.

import { apiFetch, apiUpload, ApiError } from '../../lib/apiClient';
import { FILE_ACCEPT } from '../files/fileFormat';
import { draftParam, recipientsText } from '../agents/draftsText';
import type { AgentKind } from '../agents/agentTypes';
import type { MailMessageDetail, MailParticipant, SyncIssue } from './mailboxSlice';
import { actionFailure, DRAFT_TOO_LARGE_TEXT, FILE_EMPTY, FILE_TOO_LARGE, isRecord, typeRefused, type ActionFailure } from './mailText';

export type DraftKind = 'new' | 'reply' | 'reply_all' | 'forward';
/** `[name, address]`, the shape of `MailMessage.to`. */
export type Recipient = [string, string];
export type RecordKind = 'customer' | 'account';

/** A record the owner may open (contract §2). */
export interface DraftRecord {
  kind: RecordKind;
  id: number;
  name: string;
}

export interface DraftAttachment {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  /** `upload` (added here), `gmail` (on the Gmail draft), `forward` (kept from the source). */
  origin: 'upload' | 'gmail' | 'forward';
  download_url: string;
}

/** `draft` on a message row (contract §2): null unless the message is a live draft. */
export interface MailDraftRef {
  id: number;
  agent: AgentKind | null;
  reply_draft_id: number | null;
}

export type GmailDraftState = 'local' | 'saving' | 'saved' | 'failed';

/** `GET mail/drafts/<id>/` (contract §2). */
export interface MailDraft {
  id: number;
  kind: DraftKind;
  /** `sending` reads `sent` with `sent_at: null`. */
  status: 'open' | 'sent';
  sending: 'pending' | 'unconfirmed' | null;
  revision: number;
  /** The draft's row in Drafts. */
  message_id: number | null;
  thread_id: string;
  source: { message_id: number; subject: string; from: MailParticipant; sent_at: string } | null;
  from: MailParticipant;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  html: string;
  text: string;
  attachments: DraftAttachment[];
  total_bytes: number;
  max_bytes: number;
  record: DraftRecord | null;
  suggested_record: DraftRecord | null;
  record_chosen: boolean;
  gmail: { state: GmailDraftState };
  /** Read as D2's `{text, at}` (contract gap). */
  sync_issue: SyncIssue | null;
  agent: AgentKind | null;
  reply_draft_id: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  can_resolve: boolean;
}

/** `GET mail/compose/?kind=&message=` (contract §2): nothing stored yet. */
export interface ComposePrefill {
  kind: DraftKind;
  source_message_id: number | null;
  from: MailParticipant;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  /** The signature and any quote are already in it (contract decision 17). */
  html: string;
  signature_html: string;
  forwarded: DraftAttachment[];
  record: DraftRecord | null;
  suggested_record: DraftRecord | null;
  /** Contract §2 amendment; older servers omit them, and then MAIL_SEND_MAX_BYTES is the fallback. */
  total_bytes?: number;
  max_bytes?: number;
}

/** The content fields every write takes (contract §3). */
export interface DraftContent {
  to?: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  subject?: string;
  html?: string;
  /** Forward only: the source's attachment ids to keep. */
  forwarded?: number[];
  /** Sent only once the person chose (Decision 8); `null` files it nowhere. */
  record?: { kind: RecordKind; id: number } | null;
}

export interface NewDraft extends DraftContent {
  kind: DraftKind;
  source_message_id?: number;
}

/** `POST mail/drafts/<id>/send/` 200 (contract §4). */
export interface DraftSent {
  draft: MailDraft;
  message: MailMessageDetail;
  email: { id: number; subject: string; sent_at: string; thread_id: string } | null;
}

/** An attachment delete's answer (contract §3). */
export interface DraftBytes {
  revision: number;
  total_bytes: number;
}

/** An upload's answer (contract §3). */
export interface DraftUpload extends DraftBytes {
  attachment: DraftAttachment;
}

/** One live Gmail result (contract §6); `message_id` is set when Revenact holds it. */
export interface GmailSearchResult {
  gmail_id: string;
  thread_id: string;
  subject: string;
  from: MailParticipant;
  to: Recipient[];
  snippet: string;
  sent_at: string;
  has_attachments: boolean;
  message_id: number | null;
}

export interface GmailSearchPage {
  results: GmailSearchResult[];
  next_page_token: string | null;
  result_size_estimate: number;
}

/** Contract decision 20 (`MAIL_SEND_MAX_BYTES`): the limit before a draft says its own `max_bytes`. */
export const MAIL_SEND_MAX_BYTES = 26_214_400;

const DRAFTS_PATH = '/mail/drafts/';
const one = (id: number) => `${DRAFTS_PATH}${id}/`;

export function fetchComposePrefill(kind: DraftKind, messageId: number | null): Promise<ComposePrefill> {
  const params = new URLSearchParams({ kind });
  if (messageId !== null) params.set('message', String(messageId));
  return apiFetch<ComposePrefill>(`/mail/compose/?${params.toString()}`);
}

export const createMailDraft = (body: NewDraft) => apiFetch<MailDraft>(DRAFTS_PATH, { method: 'POST', body });
export const fetchMailDraft = (id: number) => apiFetch<MailDraft>(one(id));
export const patchMailDraft = (id: number, body: DraftContent & { revision: number }) => apiFetch<MailDraft>(one(id), { method: 'PATCH', body });
/** 204: only the draft goes; the conversation stays (contract decision 12). */
export const discardMailDraft = (id: number) => apiFetch<null>(one(id), { method: 'DELETE' });
/** All or nothing, 1 to 100 ids. */
export const discardMailDrafts = (ids: number[]) => apiFetch<{ discarded: number }>(`${DRAFTS_PATH}discard/`, { method: 'POST', body: { ids } });
export const sendMailDraft = (id: number, body: DraftContent & { revision: number }) => apiFetch<DraftSent>(`${one(id)}send/`, { method: 'POST', body });
export const confirmMailDraftSent = (id: number) => apiFetch<MailDraft>(`${one(id)}confirm-sent/`, { method: 'POST' });
export const reopenMailDraft = (id: number) => apiFetch<MailDraft>(`${one(id)}reopen/`, { method: 'POST' });
export const removeDraftAttachment = (id: number, attachmentId: number) => apiFetch<DraftBytes>(`${one(id)}attachments/${attachmentId}/`, { method: 'DELETE' });

/** Multipart, form field `file` (contract §3); progress from 0 to 1. */
export function uploadDraftAttachment(id: number, file: File, onProgress: (fraction: number) => void): Promise<DraftUpload> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<DraftUpload>(`${one(id)}attachments/`, form, onProgress);
}

/** A live Gmail search (contract §6): nothing is stored. */
export function searchGmail(q: string, pageToken: string | null): Promise<GmailSearchPage> {
  const params = new URLSearchParams({ q });
  if (pageToken) params.set('page_token', pageToken);
  return apiFetch<GmailSearchPage>(`/mail/gmail/search/?${params.toString()}`);
}

/** 200 when held, 201 once stored: the message detail either way. */
export const openGmailResult = (gmailId: string) => apiFetch<MailMessageDetail>('/mail/gmail/search/open/', { method: 'POST', body: { gmail_id: gmailId } });

export type DraftField = 'to' | 'cc' | 'bcc' | 'subject' | 'html' | 'record' | 'revision' | 'file' | 'source_message_id';
const FIELDS: DraftField[] = ['to', 'cc', 'bcc', 'subject', 'html', 'record', 'revision', 'file', 'source_message_id'];

/** Why a draft write did not take: D2's failure, plus the field errors,
 *  the newest draft on DRAFT_CHANGED and the attachment a send could not get. */
export interface DraftFailure extends ActionFailure {
  fields: Partial<Record<DraftField, string>>;
  draft: MailDraft | null;
  attachmentId: number | null;
  status: number | null;
}

export function draftFailure(err: unknown, fallback: string): DraftFailure {
  const base = actionFailure(err, fallback);
  if (!(err instanceof ApiError)) return { ...base, fields: {}, draft: null, attachmentId: null, status: null };
  const body = isRecord(err.body) ? err.body : {};
  const fields: Partial<Record<DraftField, string>> = {};
  if (err.status === 400 && base.code === null) {
    for (const field of FIELDS) {
      const value = body[field];
      if (Array.isArray(value) && typeof value[0] === 'string') fields[field] = value[0];
    }
  }
  return {
    ...base,
    fields,
    draft: base.code === 'DRAFT_CHANGED' && isRecord(body.draft) ? (body.draft as unknown as MailDraft) : null,
    attachmentId: typeof body.attachment_id === 'number' ? body.attachment_id : null,
    status: err.status,
  };
}

/** A refusal the screen makes itself, before asking the server. */
export const plainFailure = (text: string): DraftFailure => ({ text, reconnect: false, code: null, fields: {}, draft: null, attachmentId: null, status: null });

const QUOTE_START = /<div\b[^>]*\bclass="[^"]*\bgmail_quote\b[^"]*"/i;

/** What the editor edits, and the quote kept as it is (Decision 7). */
export function splitQuote(html: string): { body: string; quote: string } {
  const at = html.search(QUOTE_START);
  return at < 0 ? { body: html, quote: '' } : { body: html.slice(0, at), quote: html.slice(at) };
}

export const joinQuote = (body: string, quote: string): string => body + quote;

const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Addresses typed or pasted: "Name <a@b.c>" or "a@b.c", split on commas,
 *  semicolons and new lines, lower-cased as the server stores them. */
export function parseRecipients(text: string): { valid: Recipient[]; invalid: string[] } {
  const valid: Recipient[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const part = raw.trim();
    if (!part) continue;
    const named = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(part);
    const name = named ? named[1].trim() : '';
    const address = (named ? named[2] : part).trim().toLowerCase();
    if (ADDRESS.test(address)) valid.push([name, address]);
    else invalid.push(part);
  }
  return { valid, invalid };
}

/** `list` plus `more`, without an address twice (case-insensitive). */
export function addRecipients(list: Recipient[], more: Recipient[]): Recipient[] {
  const seen = new Set(list.map(([, address]) => address.toLowerCase()));
  const out = [...list];
  for (const r of more) {
    const key = r[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([r[0], key]);
  }
  return out;
}

export const recipientName = ([name, address]: Recipient): string => name || address;
export const recipientText = (r: Recipient): string => recipientsText([r]);

const ACCEPTED = new Set(FILE_ACCEPT.split(','));

/** ".pdf" from "Quote.PDF"; "" when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** Why a file cannot be attached, checked before any upload (Decision 9); null when it can. */
export function uploadRefusal(file: { name: string; size: number }, totalBytes: number, maxBytes: number): string | null {
  const ext = extensionOf(file.name);
  if (!ACCEPTED.has(ext)) return typeRefused(ext);
  if (file.size === 0) return FILE_EMPTY;
  if (file.size > MAIL_SEND_MAX_BYTES) return FILE_TOO_LARGE;
  if (totalBytes + file.size > maxBytes) return DRAFT_TOO_LARGE_TEXT;
  return null;
}

/** `?folder=drafts&draft=<id>` on a mailbox source: a mailbox draft, not an agent's (Decision 14). */
export function mailDraftParam(params: URLSearchParams): number | null {
  if (!(params.get('source') ?? '').startsWith('mailbox:') || params.get('folder') !== 'drafts') return null;
  return draftParam(params);
}

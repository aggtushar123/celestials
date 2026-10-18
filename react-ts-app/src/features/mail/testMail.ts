// Test-only: contract-shaped fixtures and a stateful stub of revenact-backend's
// /api/v1/mail/* for the two-way Gmail tests (contract
// docs/superpowers/plans/2026-10-10-gmail-sync-api.md, and D2's 2026-10-11-gmail-actions-api.md). Tests change `state`
// between polls; every answer is a JSON copy. Anything else the pages ask for
// (Communications' queue and stats, connectors, the Copilot rail) gets an
// empty answer.

import { vi } from 'vitest';
import { FILE_ACCEPT } from '../files/fileFormat';
import { DRAFT_TOO_LARGE_TEXT, FILE_EMPTY, FILE_TOO_LARGE, GATE_COPY, NO_MAILBOX_TEXT, TWO_WAY_OFF_TEXT, typeRefused } from './mailText';
import { extensionOf, MAIL_SEND_MAX_BYTES } from './mailDrafts';
import type { ComposePrefill, DraftAttachment, DraftContent, DraftKind, DraftRecord, GmailSearchResult, MailDraft, Recipient } from './mailDrafts';
import { patchOfOp } from './mailOptimistic';
import type { DisconnectedMailbox, GmailGate, MailboxConnection, MailProviderOption, PausedReason } from './mailSlice';
import type { MailLabel, MailLabelEntry, MailMessage, MailMessageDetail, MailOp, MailSummary, MailThread, MailThreadDetail, ThreadPatch } from './mailboxSlice';

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const GOOGLE: MailboxConnection = {
  id: 12,
  provider: 'google',
  provider_display: 'Google Workspace / Gmail',
  address: 'dana@doughco.com',
  display_name: 'Dana Ruiz',
  status: 'connected',
  error: '',
  last_synced_at: '2026-10-10T09:14:05Z',
  created_at: '2026-10-10T08:01:44Z',
  two_way: true,
  needs_reconnect: false,
  granted_scopes: ['gmail.modify', 'gmail.send', 'gmail.compose'],
  import: { state: 'importing', imported: 4210, total_estimate: 18000, done_at: null },
  push: true,
  paused_reason: null,
  signature: { text: 'Dana Ruiz\nDough Co', editable: false, source: 'gmail' },
};

/** Contract §9: Outlook and IMAP carry the new fields at their quiet values. */
export const OUTLOOK: MailboxConnection = {
  ...GOOGLE,
  id: 13,
  provider: 'microsoft',
  provider_display: 'Microsoft 365 / Outlook',
  two_way: false,
  needs_reconnect: false,
  granted_scopes: [],
  import: null,
  push: false,
  paused_reason: null,
  signature: { text: '', editable: true, source: 'revenact' },
};

export const PROVIDERS: MailProviderOption[] = [
  { key: 'google', label: 'Google Workspace / Gmail', uses_oauth: true, gate: null },
  { key: 'microsoft', label: 'Microsoft 365 / Outlook', uses_oauth: true, gate: null },
  { key: 'imap', label: 'IMAP / SMTP', uses_oauth: false, gate: null },
];

export const MAIL_DETAIL: MailMessageDetail = {
  id: 1,
  thread_id: 't1',
  direction: 'received',
  from_name: 'Ann Lee',
  from_address: 'ann@pizzahut.com',
  to: [['Dana Ruiz', 'dana@doughco.com']],
  cc: [['Sam Pizza', 'sam@pizzahut.com']],
  bcc: [],
  subject: 'Renewal quote',
  snippet: 'Quote attached.',
  sent_at: '2026-10-09T09:00:00Z',
  folder: 'inbox',
  category: 'general',
  state: 'open',
  is_read: false,
  is_starred: false,
  is_important: false,
  priority: false,
  account: { id: 3, name: 'Pizza Hut', type: 'customer' },
  sync_issue: null,
  labels: [
    { id: 7, name: 'Renewals', color: { background: '#16a766', text: '#ffffff' }, pending: false },
    { id: 9, name: 'Vendors/Billing', color: null, pending: false },
    { id: 11, name: 'Q4', color: null, pending: false },
  ],
  has_attachments: true,
  body: 'Hi Dana,\nQuote attached.\nAnn',
  html_body: '<div style="font-family:Arial"><p>Hi Dana,</p><p>Quote attached.</p><img src="cid:logo@pizzahut" alt="Logo"><img src="https://cdn.pizzahut.com/sig.png" alt="Pizza Hut"></div>',
  attachments: [
    { id: 31, filename: 'Renewal quote.pdf', mime_type: 'application/pdf', size: 182311, is_inline: false, content_id: '', available: true, preview: true, download_url: '/api/v1/mail/attachments/31/download/' },
    { id: 32, filename: 'logo.png', mime_type: 'image/png', size: 2048, is_inline: true, content_id: 'logo@pizzahut', available: true, preview: true, download_url: '/api/v1/mail/attachments/32/download/' },
    { id: 33, filename: 'Pricing.zip', mime_type: 'application/zip', size: 24576, is_inline: false, content_id: '', available: true, preview: false, download_url: '/api/v1/mail/attachments/33/download/' },
  ],
};

function rowOf(detail: MailMessageDetail): MailMessage {
  const row: Partial<MailMessageDetail> = copy(detail);
  delete row.body;
  delete row.html_body;
  delete row.attachments;
  return row as MailMessage;
}

export const MAIL_ROW: MailMessage = rowOf(MAIL_DETAIL);

/** Your own earlier message in Ann's thread: D2's two-message conversation. */
export const MAIL_EARLIER: MailMessageDetail = {
  ...MAIL_DETAIL,
  id: 3,
  direction: 'sent',
  from_name: 'Dana Ruiz',
  from_address: 'dana@doughco.com',
  to: [['Ann Lee', 'ann@pizzahut.com']],
  cc: [],
  snippet: 'Could you send the renewal quote?',
  sent_at: '2026-10-08T15:00:00Z',
  folder: 'sent',
  is_read: true,
  labels: [],
  has_attachments: false,
  body: 'Hi Ann,\nCould you send the renewal quote?\nDana',
  html_body: '',
  attachments: [],
};

/** A second conversation, already read and on no record. */
export const MAIL_INVOICE: MailMessageDetail = {
  ...MAIL_DETAIL,
  id: 4,
  thread_id: 't2',
  from_name: 'Circleback',
  from_address: 'billing@circleback.ai',
  cc: [],
  subject: 'Invoice 1042',
  snippet: 'Your invoice is ready.',
  sent_at: '2026-10-07T08:00:00Z',
  category: 'financial',
  is_read: true,
  account: null,
  labels: [],
  has_attachments: false,
  body: 'Your invoice is ready.',
  html_body: '',
  attachments: [],
};

/** The signature block the server puts in every new draft (D3 contract decision 17). */
export const SIGNATURE = '<div data-revenact-signature>Dana Ruiz<br>Dough Co</div>';

/** The quote under a reply to Ann (D3 contract §2). */
export const QUOTE_ANN = '<div class="gmail_quote">On 2026-10-09, Ann Lee &lt;ann@pizzahut.com&gt; wrote:<blockquote>Hi Dana,\nQuote attached.\nAnn</blockquote></div>';

/** Contract decision 20: a draft's total_bytes counts its html and text bodies with its files. */
export const bodyBytes = (html: string, text: string): number => new TextEncoder().encode(html).length + new TextEncoder().encode(text).length;

const DRAFT_HTML = `<p>Works for us.</p>${SIGNATURE}${QUOTE_ANN}`;
const DRAFT_TEXT = 'Works for us.\n\n-- \nDana Ruiz\nDough Co';

/** A person's reply to Ann, saved in Gmail (D3 contract §2). */
export const MAIL_DRAFT: MailDraft = {
  id: 55,
  kind: 'reply',
  status: 'open',
  sending: null,
  revision: 1,
  message_id: 70,
  thread_id: 't1',
  source: { message_id: 1, subject: 'Renewal quote', from: { name: 'Ann Lee', address: 'ann@pizzahut.com' }, sent_at: '2026-10-09T09:00:00Z' },
  from: { name: 'Dana Ruiz', address: 'dana@doughco.com' },
  to: [['Ann Lee', 'ann@pizzahut.com']],
  cc: [],
  bcc: [],
  subject: 'Re: Renewal quote',
  html: DRAFT_HTML,
  text: DRAFT_TEXT,
  attachments: [],
  total_bytes: bodyBytes(DRAFT_HTML, DRAFT_TEXT),
  max_bytes: 26214400,
  record: { kind: 'customer', id: 3, name: 'Pizza Hut' },
  suggested_record: { kind: 'customer', id: 3, name: 'Pizza Hut' },
  record_chosen: false,
  gmail: { state: 'saved' },
  sync_issue: null,
  agent: null,
  reply_draft_id: null,
  created_at: '2026-10-11T09:01:00Z',
  updated_at: '2026-10-11T09:03:12Z',
  sent_at: null,
  can_resolve: false,
};

/** MAIL_DRAFT's row in Drafts and in Ann's conversation. */
export const MAIL_DRAFT_MESSAGE: MailMessageDetail = {
  ...MAIL_EARLIER,
  id: 70,
  thread_id: 't1',
  to: [['Ann Lee', 'ann@pizzahut.com']],
  subject: 'Re: Renewal quote',
  snippet: 'Works for us.',
  sent_at: '2026-10-11T09:03:12Z',
  folder: 'drafts',
  account: null,
  body: 'Works for us.',
  html_body: MAIL_DRAFT.html,
  draft: { id: 55, agent: null, reply_draft_id: null },
};

/** A message only Gmail holds: older than the import (D3 contract §6). */
export const GMAIL_OLD: MailMessageDetail = {
  ...MAIL_DETAIL,
  id: 501,
  thread_id: 'g-old',
  subject: '2024 renewal',
  snippet: "Attached is last year's quote.",
  sent_at: '2024-09-30T15:12:00Z',
  is_read: true,
  labels: [],
  body: "Attached is last year's quote.",
  html_body: '',
  attachments: [],
};

/** Names the record picker's stub offers, by `kind:id`; any other record is one the owner cannot open. */
const RECORD_NAMES: Record<string, string> = { 'customer:2': 'Dough Co', 'customer:3': 'Pizza Hut' };
const STUB_NOW = '2026-10-11T09:05:00Z';
const SIGNATURE_HTML = 'Dana Ruiz<br>Dough Co';

/** The mailbox `q` (D1 contract): subject, sender name, sender address, snippet. */
const matchesQ = (m: MailMessageDetail, q: string): boolean => !q || [m.subject, m.from_name, m.from_address, m.snippet].some((field) => field.toLowerCase().includes(q));

/** D2's mailbox: Ann's two-message thread (t1) and the invoice (t2). */
export const D2_MESSAGES: MailMessageDetail[] = [MAIL_EARLIER, MAIL_DETAIL, MAIL_INVOICE];

/** `GET mail/labels/` (D2 contract §4), by name. */
export const MAIL_LABELS: MailLabelEntry[] = [
  { id: 11, gmail_id: 'Label_14', name: 'Q4', color: null, unread: 0, pending: false },
  { id: 7, gmail_id: 'Label_12', name: 'Renewals', color: { background: '#16a766', text: '#ffffff' }, unread: 1, pending: false },
  { id: 9, gmail_id: 'Label_13', name: 'Vendors/Billing', color: null, unread: 1, pending: false },
];

const byName = (a: MailLabel, b: MailLabel) => a.name.localeCompare(b.name);
const bySent = (a: MailMessage, b: MailMessage) => a.sent_at.localeCompare(b.sent_at);

/** A conversation row for one message, as the server would list it alone (D2 §2). */
export function threadRowOf(m: MailMessage, more: Partial<MailThread> = {}): MailThread {
  return {
    id: m.id,
    thread_id: m.thread_id,
    subject: m.subject,
    snippet: m.snippet,
    last_sent_at: m.sent_at,
    message_count: 1,
    unread_count: m.is_read ? 0 : 1,
    participants: [{ name: m.from_name, address: m.from_address }],
    more_participants: 0,
    is_read: m.is_read,
    is_starred: m.is_starred,
    is_important: m.is_important,
    priority: m.priority,
    state: m.state,
    folder: m.folder,
    has_attachments: m.has_attachments,
    labels: m.labels,
    account: m.account,
    sync_issue: m.sync_issue,
    draft: m.draft ?? null,
    ...more,
  };
}

function unionLabels(messages: MailMessage[]): MailLabel[] {
  const seen = new Map<number, MailLabel>();
  for (const m of messages) for (const label of m.labels) seen.set(label.id, label);
  return [...seen.values()].sort(byName);
}

/** The thread payload for the messages of one thread, oldest first (D2 §2). */
export function threadOf(messages: MailMessageDetail[]): MailThreadDetail {
  const ordered = [...messages].sort(bySent);
  const issues = ordered.map((m) => m.sync_issue).filter((issue) => issue !== null);
  return {
    thread_id: ordered[0].thread_id,
    subject: ordered[0].subject,
    labels: unionLabels(ordered),
    account: [...ordered].reverse().find((m) => m.account)?.account ?? null,
    sync_issue: issues.at(-1) ?? null,
    truncated: false,
    messages: ordered,
  };
}

export const MAIL_SUMMARY: MailSummary = {
  has_mailbox: true,
  address: 'dana@doughco.com',
  last_synced_at: '2026-10-10T09:14:05Z',
  import: { state: 'importing', imported: 4210, total_estimate: 18000, done_at: null },
  paused_reason: null,
  folders: { inbox: 1, drafts: 0, sent: 0, done: 0, muted: 0 },
  unread: 1,
  categories: [],
};

export interface MailStubState {
  connection: MailboxConnection | null;
  disconnected: DisconnectedMailbox | null;
  providers: MailProviderOption[];
  /** A pre-OAuth refusal from POST mail/connect/google/ (403). */
  connectRefusal: GmailGate | null;
  messages: MailMessageDetail[];
  summary: MailSummary;
  labels: MailLabelEntry[];
  /** The next action (thread PATCH, bulk, label create) answers this instead. */
  failNext: { status: number; body: unknown } | null;
  /** Attachment downloads that answer this instead, by attachment id. */
  attachmentRefusals: Record<number, { status: number; body: unknown }>;
  /** Mailbox drafts (D3 contract §1); each has a row in `messages`. */
  drafts: MailDraft[];
  /** What only Gmail has: search finds it, open stores it. */
  gmailOnly: MailMessageDetail[];
  /** The next send answers this instead (504 SEND_UNCONFIRMED, 409 DRAFT_GONE, ...). */
  sendAnswer: { status: number; body: unknown } | null;
  /** Every draft save reaches Revenact but fails in Gmail (gmail.state failed). */
  draftSaveFails: boolean;
  /** GET calendar/status/ (Google Calendar). Default: not stubbed, a 404. */
  calendar: { calendar: 'connected' | 'needs_consent' | 'not_connected'; last_synced_at: string | null } | null;
}

// The contract gives the workspace_off sentence; the others stand in for the server's.
const PAUSED_DETAIL: Record<PausedReason, string> = {
  workspace_off: "Your Gmail connection is paused: your workspace isn't enabled for Gmail.",
  suspended: 'Your Gmail connection is paused: your access to this workspace is suspended.',
  no_seat: 'Your Gmail connection is paused: you no longer hold a seat.',
  token_revoked: 'Your Gmail connection is paused: Google access was revoked.',
};

export function stubMail(initial: Partial<MailStubState> = {}) {
  const state: MailStubState = {
    connection: copy(GOOGLE),
    disconnected: null,
    providers: copy(PROVIDERS),
    connectRefusal: null,
    messages: [copy(MAIL_DETAIL)],
    summary: copy(MAIL_SUMMARY),
    labels: copy(MAIL_LABELS),
    failNext: null,
    attachmentRefusals: {},
    drafts: [],
    gmailOnly: [],
    sendAnswer: null,
    draftSaveFails: false,
    calendar: null,
    ...copy(initial),
  };
  const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => copy(body) });
  const paused = () => {
    const reason = state.connection?.paused_reason;
    return reason ? json(409, { code: 'MAILBOX_PAUSED', detail: PAUSED_DETAIL[reason], paused_reason: reason }) : null;
  };
  const mates = (anchor: MailMessageDetail) =>
    state.messages.filter((m) => (anchor.thread_id ? m.thread_id === anchor.thread_id : m.id === anchor.id)).sort(bySent);

  // GET mail/threads/ filters per message (D2 contract decision 17).
  const inView = (m: MailMessageDetail, params: URLSearchParams) => {
    if (!matchesQ(m, (params.get('q') ?? '').toLowerCase())) return false;
    const folder = params.get('folder') ?? 'inbox';
    const label = params.get('label');
    if (label && !m.labels.some((l) => l.id === Number(label))) return false;
    if (folder === 'inbox') return m.folder === 'inbox' && m.state === 'open';
    if (folder === 'all') return m.folder !== 'trash' && m.folder !== 'spam';
    if (folder === 'done' || folder === 'muted') return m.state === folder && m.folder !== 'trash' && m.folder !== 'spam';
    if (folder === 'starred') return m.is_starred;
    if (folder === 'important') return m.is_important;
    return m.folder === folder;
  };

  const threadRows = (params: URLSearchParams): MailThread[] => {
    const groups = new Map<string, MailMessageDetail[]>();
    for (const m of state.messages) {
      const key = m.thread_id || `m${m.id}`;
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    const binned = ['trash', 'spam'].includes(params.get('folder') ?? '');
    const rows: MailThread[] = [];
    for (const group of groups.values()) {
      const ordered = [...group].sort(bySent);
      const matching = ordered.filter((m) => inView(m, params));
      if (matching.length === 0) continue;
      const counted = binned ? ordered : ordered.filter((m) => m.folder !== 'trash' && m.folder !== 'spam');
      const senders = new Map<string, { name: string; address: string }>();
      for (const m of ordered) senders.set(m.from_address, { name: m.from_name, address: m.from_address });
      rows.push(
        threadRowOf(matching[matching.length - 1], {
          message_count: counted.length,
          unread_count: counted.filter((m) => !m.is_read).length,
          participants: [...senders.values()],
          is_read: counted.every((m) => m.is_read),
          is_starred: counted.some((m) => m.is_starred),
          has_attachments: ordered.some((m) => m.has_attachments),
          labels: unionLabels(ordered),
          sync_issue: threadOf(ordered).sync_issue,
        }),
      );
    }
    return rows.sort((a, b) => b.last_sent_at.localeCompare(a.last_sent_at));
  };

  // Contract §3 checks 4 to 6 for a request that writes to Gmail, after the injected failure.
  const refuse = (writes: boolean) => {
    if (state.failNext) {
      const { status, body } = state.failNext;
      state.failNext = null;
      return json(status, body);
    }
    if (!writes) return null;
    const c = state.connection;
    if (!c) return json(409, { code: 'NO_MAILBOX', detail: NO_MAILBOX_TEXT });
    if (c.provider !== 'google') return null;
    return paused() ?? (c.two_way ? null : json(409, { code: 'TWO_WAY_OFF', detail: TWO_WAY_OFF_TEXT, needs_reconnect: true }));
  };

  const labelOf = (id: number): MailLabel | null => {
    const l = state.labels.find((x) => x.id === id);
    return l ? { id: l.id, name: l.name, color: l.color, pending: l.pending } : null;
  };

  const applyPatch = (group: MailMessageDetail[], patch: ThreadPatch) => {
    const removed = patch.remove_labels;
    group.forEach((m, index) => {
      if (patch.is_read !== undefined) m.is_read = patch.is_read;
      if (patch.is_starred !== undefined) m.is_starred = patch.is_starred ? index === group.length - 1 || m.is_starred : false;
      if (patch.state !== undefined) m.state = patch.state;
      if (patch.trashed !== undefined) m.folder = patch.trashed ? 'trash' : m.direction === 'sent' ? 'sent' : 'inbox';
      if (patch.spam !== undefined) m.folder = patch.spam ? 'spam' : 'inbox';
      for (const id of patch.add_labels ?? []) {
        const label = labelOf(id);
        if (label && !m.labels.some((l) => l.id === id)) m.labels = [...m.labels, label].sort(byName);
      }
      if (removed) m.labels = m.labels.filter((l) => !removed.includes(l.id));
    });
  };

  // A mute alone never writes to Gmail (contract §3).
  const writesGmail = (patch: ThreadPatch) => !(Object.keys(patch).length === 1 && patch.state === 'muted');

  let nextId = 900;
  const me = () => ({ name: state.connection?.display_name ?? '', address: state.connection?.address ?? '' });
  // Contract §3 checks 1 to 4, in order; 4 (paused) for a send only.
  const draftRefusal = (send: boolean) => {
    const c = state.connection;
    if (c && c.provider !== 'google') return json(400, { code: 'GMAIL_ONLY', detail: 'Only Gmail mailboxes have this.' });
    if (!c) return json(409, { code: 'NO_MAILBOX', detail: NO_MAILBOX_TEXT });
    if (!c.two_way) return json(409, { code: 'TWO_WAY_OFF', detail: TWO_WAY_OFF_TEXT, needs_reconnect: true });
    return send ? paused() : null;
  };
  // Contract §6: reading Gmail needs a Google mailbox, connected and not paused; one-way Google may search.
  const searchRefusal = () => {
    const c = state.connection;
    if (c && c.provider !== 'google') return json(400, { code: 'GMAIL_ONLY', detail: 'Only Gmail mailboxes have this.' });
    return c ? paused() : json(409, { code: 'NO_MAILBOX', detail: NO_MAILBOX_TEXT });
  };
  const recordOf = (m: MailMessageDetail | null | undefined): DraftRecord | null => (m?.account ? { kind: m.account.type, id: m.account.id, name: m.account.name } : null);
  const fileOf = (a: MailMessageDetail['attachments'][number]): DraftAttachment => ({ id: a.id, filename: a.filename, mime_type: a.mime_type, size: a.size, origin: 'forward', download_url: a.download_url ?? '' });
  const textOf = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  const withinAccepted = FILE_ACCEPT.split(',');
  const sum = (files: { size: number }[]) => files.reduce((total, f) => total + f.size, 0);
  // Decision 20: the files and both bodies.
  const totalOf = (d: Pick<MailDraft, 'attachments' | 'html' | 'text'>) => sum(d.attachments) + bodyBytes(d.html, d.text);

  // Contract §2: the caller's own address is out of to and cc, an address appears once, to before cc.
  const prefillOf = (kind: DraftKind, source: MailMessageDetail | null): ComposePrefill => {
    const mine = me().address.toLowerCase();
    const seen = new Set<string>([mine]);
    const fresh = (list: Recipient[]) => list.filter(([, address]) => !seen.has(address.toLowerCase()) && !!seen.add(address.toLowerCase()));
    const back: Recipient[] = !source ? [] : source.direction === 'sent' ? source.to : [[source.from_name, source.from_address]];
    const to = kind === 'reply' ? fresh(back) : kind === 'reply_all' && source ? fresh([...back, ...source.to]) : [];
    const cc = kind === 'reply_all' && source ? fresh(source.cc) : [];
    const subject = !source
      ? ''
      : kind === 'forward'
        ? /^fwd?:/i.test(source.subject) ? source.subject : `Fwd: ${source.subject}`
        : /^re:/i.test(source.subject) ? source.subject : `Re: ${source.subject}`;
    const named = ([name, address]: Recipient) => (name ? `${name} &lt;${address}&gt;` : address);
    const lines = (label: string, list: Recipient[]) => (list.length ? `<br>${label}: ${list.map(named).join(', ')}` : '');
    const below = !source
      ? ''
      : kind === 'forward'
        ? `<div class="gmail_quote">---------- Forwarded message ---------<br>From: ${named([source.from_name, source.from_address])}<br>Date: ${source.sent_at.slice(0, 10)}<br>Subject: ${source.subject}${lines('To', source.to)}${lines('Cc', source.cc)}<br><br>${source.html_body || source.body}</div>`
        : `<div class="gmail_quote">On ${source.sent_at.slice(0, 10)}, ${named([source.from_name, source.from_address])} wrote:<blockquote>${source.body}</blockquote></div>`;
    const forwarded = kind === 'forward' && source ? source.attachments.filter((a) => !a.is_inline).map(fileOf) : [];
    return {
      kind,
      source_message_id: source?.id ?? null,
      from: me(),
      to,
      cc,
      bcc: [],
      subject,
      html: `<p></p>${SIGNATURE}${below}`,
      signature_html: SIGNATURE_HTML,
      forwarded,
      record: recordOf(source),
      suggested_record: recordOf(source),
      total_bytes: sum(forwarded) + bodyBytes(`<p></p>${SIGNATURE}${below}`, textOf(`<p></p>${SIGNATURE}${below}`)),
      max_bytes: MAIL_SEND_MAX_BYTES,
    };
  };

  // The draft's row in Drafts (contract decision 2), rewritten on every change.
  const rowOfDraft = (d: MailDraft): MailMessageDetail => ({
    ...copy(MAIL_EARLIER),
    id: d.message_id as number,
    thread_id: d.thread_id,
    from_name: d.from.name,
    from_address: d.from.address,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    snippet: d.text.slice(0, 100),
    sent_at: d.updated_at,
    folder: 'drafts',
    account: null,
    sync_issue: d.sync_issue,
    has_attachments: d.attachments.length > 0,
    body: d.text,
    html_body: d.html,
    attachments: d.attachments.map((a) => ({ id: a.id, filename: a.filename, mime_type: a.mime_type, size: a.size, is_inline: false, content_id: '', available: true, preview: false, download_url: a.download_url })),
    draft: { id: d.id, agent: d.agent, reply_draft_id: d.reply_draft_id },
  });
  const syncRow = (d: MailDraft) => {
    const at = state.messages.findIndex((m) => m.id === d.message_id);
    if (at >= 0) state.messages[at] = rowOfDraft(d);
    else state.messages.push(rowOfDraft(d));
  };

  // Contract §3: a bad field is a 400 before anything is stored.
  const contentError = (d: Pick<MailDraft, 'agent'> | null, body: DraftContent, skipRecord = false) => {
    const lists = [body.to, body.cc, body.bcc].flatMap((list) => list ?? []);
    const address = (r: Recipient | string) => (typeof r === 'string' ? r : r[1]);
    if (lists.some((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address(r)))) return json(400, { to: ['Enter a valid email address.'] });
    if (lists.length > 100) return json(400, { to: ['A message can go to 100 people.'] });
    if ((body.subject ?? '').length > 255) return json(400, { subject: ['Keep the subject under 255 characters.'] });
    if (body.record !== undefined && d?.agent) return json(400, { record: ['An agent draft stays on its record.'] });
    return skipRecord ? null : recordRefusal(body);
  };
  const recordRefusal = (body: DraftContent) =>
    body.record && !RECORD_NAMES[`${body.record.kind}:${body.record.id}`] ? json(400, { record: ['Choose a record you can open.'] }) : null;
  // Applies content; true when anything changed (the revision moves only then).
  const applyContent = (d: MailDraft, body: DraftContent): boolean => {
    const before = JSON.stringify([d.to, d.cc, d.bcc, d.subject, d.html, d.attachments, d.record]);
    const pairs = (list: (Recipient | string)[]): Recipient[] => list.map((r) => (typeof r === 'string' ? ['', r.toLowerCase()] : [r[0], r[1].toLowerCase()]));
    if (body.to) d.to = pairs(body.to);
    if (body.cc) d.cc = pairs(body.cc);
    if (body.bcc) d.bcc = pairs(body.bcc);
    // An address stays in the first of to, cc, bcc that holds it.
    const seen = new Set<string>();
    for (const field of ['to', 'cc', 'bcc'] as const) d[field] = d[field].filter(([, address]) => !seen.has(address) && !!seen.add(address));
    if (body.subject !== undefined) d.subject = body.subject;
    if (body.html !== undefined) {
      d.html = body.html;
      d.text = textOf(body.html);
    }
    if (body.forwarded) d.attachments = d.attachments.filter((a) => a.origin !== 'forward' || body.forwarded!.includes(a.id));
    if (body.record !== undefined) {
      d.record = body.record ? { ...body.record, name: RECORD_NAMES[`${body.record.kind}:${body.record.id}`] } : null;
      d.record_chosen = true;
    }
    d.total_bytes = totalOf(d);
    return JSON.stringify([d.to, d.cc, d.bcc, d.subject, d.html, d.attachments, d.record]) !== before;
  };
  const changedAnswer = (d: MailDraft) => json(409, { code: 'DRAFT_CHANGED', detail: 'This draft changed in Gmail. Here is the newest version.', draft: d });
  const SAVE_FAILED = "Couldn't save this draft to Gmail.";
  // A write sets saving (contract §3); the worker's answer arrives on the next read (see settleDrafts).
  const touched = (d: MailDraft) => {
    d.revision += 1;
    d.updated_at = STUB_NOW;
    d.gmail = { state: 'saving' };
    d.sync_issue = null;
    syncRow(d);
  };
  // The worker flushes a saving draft: saved, or failed with a sync issue when `draftSaveFails`.
  const settleDrafts = () => {
    for (const d of state.drafts.filter((x) => x.status === 'open' && x.gmail.state === 'saving')) {
      d.gmail = { state: state.draftSaveFails ? 'failed' : 'saved' };
      d.sync_issue = state.draftSaveFails ? { text: SAVE_FAILED, at: STUB_NOW } : null;
      syncRow(d);
    }
  };
  const openDraft = (id: number) => state.drafts.find((d) => d.id === id);
  const formFile = (init?: RequestInit) => (init?.body instanceof FormData ? init.body.get('file') : null);
  const gone = (d: MailDraft) => {
    state.drafts = state.drafts.filter((x) => x !== d);
    state.messages = state.messages.filter((m) => m.id !== d.message_id);
  };
  const spy = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    if (path === '/calendar/status/' && method === 'GET') return state.calendar ? json(200, state.calendar) : json(404, { detail: 'Not found.' });
    if (path === '/mail/connection/' && method === 'GET') {
      return json(200, { connection: state.connection, disconnected: state.disconnected, providers: state.providers });
    }
    if (path === '/mail/connection/' && method === 'DELETE') {
      const gone = state.connection;
      state.connection = null;
      state.disconnected =
        gone?.provider === 'google' ? { provider: 'google', address: gone.address, disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' } : null;
      return Promise.resolve({ ok: true, status: 204, json: async () => null });
    }
    if (path === '/mail/connection/' && method === 'PATCH') {
      if (!state.connection) return json(404, { detail: 'Connect your mailbox first.' });
      const value = (JSON.parse(String(init?.body ?? '{}')) as { signature?: unknown }).signature;
      if (typeof value !== 'string') return json(400, { signature: ['Write a signature, or leave it empty.'] });
      const lines = value.replace(/\r\n/g, '\n').trim().split('\n').map((line) => line.trimEnd());
      const text = lines.join('\n');
      if (text.length > 1000) return json(400, { signature: ['Keep the signature under 1000 characters.'] });
      if (lines.length > 10) return json(400, { signature: ['Keep the signature to 10 lines.'] });
      if (state.connection.provider === 'google') return json(409, { code: 'SIGNATURE_IN_GMAIL', detail: 'Change your signature in Gmail. Revenact uses it from there.' });
      if (state.connection.provider !== 'microsoft') return json(409, { code: 'NO_SIGNATURE', detail: 'Signatures are for Outlook mailboxes here.' });
      state.connection = { ...state.connection, signature: { text, editable: true, source: 'revenact' } };
      return json(200, { connection: state.connection });
    }
    if (path === '/mail/connect/imap/' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { address: string };
      state.connection = { ...copy(OUTLOOK), id: 14, provider: 'imap', provider_display: 'IMAP / SMTP', address: body.address };
      return json(201, state.connection);
    }
    const connect = /^\/mail\/connect\/(google|microsoft)\/$/.exec(path);
    if (connect && method === 'POST') {
      if (connect[1] === 'google' && state.connectRefusal) return json(403, { code: state.connectRefusal, detail: GATE_COPY[state.connectRefusal] });
      return json(200, { authorize_url: `https://accounts.example/${connect[1]}?state=x` });
    }
    if (path === '/mail/sync/' && method === 'POST') {
      if (!state.connection) return json(400, { detail: 'No mailbox connected.' });
      if (state.connection.provider !== 'google') return json(200, { ...state.connection, filed: 0 });
      return paused() ?? json(202, { ...state.connection, filed: null, queued: true });
    }
    if (path === '/mail/labels/' && method === 'GET') return json(200, state.labels);
    if (path === '/mail/labels/' && method === 'POST') {
      const failed = refuse(true);
      if (failed) return failed;
      const name = String((JSON.parse(String(init?.body ?? '{}')) as { name?: string }).name ?? '').trim();
      if (!name) return json(400, { name: ['Name the label.'] });
      const existing = state.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (existing) return json(409, { code: 'LABEL_EXISTS', detail: `You already have a label called ${existing.name}.`, label_id: existing.id });
      const label: MailLabelEntry = { id: Math.max(0, ...state.labels.map((l) => l.id)) + 1, gmail_id: null, name, color: null, unread: 0, pending: true };
      state.labels = [...state.labels, label].sort(byName);
      return json(201, label);
    }
    if (path === '/mail/threads/' && method === 'GET') {
      settleDrafts();
      const results = threadRows(url.searchParams);
      return json(200, { count: results.length, next: null, previous: null, results });
    }
    const thread = /^\/mail\/messages\/(\d+)\/thread\/$/.exec(path);
    if (thread) {
      settleDrafts();
      const anchor = state.messages.find((m) => m.id === Number(thread[1]));
      if (!anchor) return json(404, { detail: 'Not found.' });
      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body ?? '{}')) as ThreadPatch;
        const failed = refuse(writesGmail(patch));
        if (failed) return failed;
        applyPatch(mates(anchor), patch);
      }
      return json(200, threadOf(mates(anchor)));
    }
    if (path === '/mail/actions/' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { op: MailOp; thread_of: number[]; label_id?: number };
      const failed = refuse(body.op !== 'mute' && body.op !== 'unmute');
      if (failed) return failed;
      const anchors = body.thread_of.map((id) => state.messages.find((m) => m.id === id));
      if (anchors.some((a) => a === undefined)) return json(404, { detail: 'Not found.' });
      const patch = patchOfOp(body.op, body.label_id ?? null);
      let messages = 0;
      for (const anchor of anchors as MailMessageDetail[]) {
        const group = mates(anchor);
        applyPatch(group, patch);
        messages += group.length;
      }
      return json(200, { op: body.op, messages, threads: anchors.length, unchanged: 0 });
    }
    if (path === '/mail/compose/' && method === 'GET') {
      const kind = (url.searchParams.get('kind') ?? '') as DraftKind;
      if (!['new', 'reply', 'reply_all', 'forward'].includes(kind)) return json(400, { kind: ['Choose new, reply, reply_all or forward.'] });
      const sourceId = url.searchParams.get('message');
      const source = sourceId ? state.messages.find((m) => m.id === Number(sourceId)) : null;
      if (kind !== 'new' && !sourceId) return json(400, { message: ['Choose a message to answer.'] });
      if (kind !== 'new' && !source) return json(404, { detail: 'Not found.' });
      if (source?.draft) return json(409, { code: 'IS_DRAFT', detail: 'This message is a draft.' });
      return draftRefusal(false) ?? json(200, prefillOf(kind, source ?? null));
    }
    if (path === '/mail/drafts/' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as DraftContent & { kind: DraftKind; source_message_id?: number };
      if (!['new', 'reply', 'reply_all', 'forward'].includes(body.kind)) return json(400, { kind: ['Choose new, reply, reply_all or forward.'] });
      const source = body.source_message_id ? state.messages.find((m) => m.id === body.source_message_id) : null;
      if (body.kind !== 'new' && !body.source_message_id) return json(400, { source_message_id: ['Choose a message to answer.'] });
      if (body.kind !== 'new' && !source) return json(404, { detail: 'Not found.' });
      if (source?.draft) return json(409, { code: 'IS_DRAFT', detail: 'This message is a draft.' });
      const refused = draftRefusal(false) ?? contentError(null, body);
      if (refused) return refused;
      const prefill = prefillOf(body.kind, source ?? null);
      const id = nextId++;
      const d: MailDraft = {
        ...copy(MAIL_DRAFT),
        id,
        kind: body.kind,
        revision: 1,
        message_id: nextId++,
        thread_id: source?.thread_id ?? `t-new-${id}`,
        source: source ? { message_id: source.id, subject: source.subject, from: { name: source.from_name, address: source.from_address }, sent_at: source.sent_at } : null,
        from: prefill.from,
        to: prefill.to,
        cc: prefill.cc,
        bcc: [],
        subject: prefill.subject,
        html: prefill.html,
        text: textOf(prefill.html),
        attachments: copy(prefill.forwarded),
        record: prefill.record,
        suggested_record: prefill.suggested_record,
        record_chosen: false,
        gmail: { state: 'saving' },
        sync_issue: null,
        created_at: STUB_NOW,
        updated_at: STUB_NOW,
      };
      applyContent(d, body);
      state.drafts.push(d);
      syncRow(d);
      return json(201, d);
    }
    if (path === '/mail/drafts/discard/' && method === 'POST') {
      const { ids } = JSON.parse(String(init?.body ?? '{}')) as { ids: number[] };
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100) return json(400, { ids: ['Choose 1 to 100 drafts.'] });
      if (ids.some((id) => openDraft(id)?.status !== 'open')) return json(404, { detail: 'Not found.' });
      const discarded = state.drafts.filter((d) => ids.includes(d.id));
      discarded.forEach(gone);
      return json(200, { discarded: discarded.length });
    }
    const draftPath = /^\/mail\/drafts\/(\d+)\/(?:(send|confirm-sent|reopen)\/|attachments\/(?:(\d+)\/)?)?$/.exec(path);
    if (draftPath) {
      const d = openDraft(Number(draftPath[1]));
      if (!d) return json(404, { detail: 'Not found.' });
      const [, , verb, attachmentId] = draftPath;
      const isAttachments = path.includes('/attachments/');
      const alreadySent = () => json(409, { code: 'ALREADY_SENT', detail: 'This draft has been sent.' });
      if (!verb && !isAttachments && method === 'GET') {
        settleDrafts();
        return json(200, d);
      }
      if (!verb && !isAttachments && method === 'DELETE') {
        if (d.status !== 'open') return alreadySent();
        const c = state.connection;
        if (c && c.provider !== 'google') return json(400, { code: 'GMAIL_ONLY', detail: 'Only Gmail mailboxes have this.' });
        // Only a draft Gmail holds needs the mailbox; a local one is discarded anyway.
        if (!c && d.gmail.state === 'saved') return json(409, { code: 'NO_MAILBOX', detail: NO_MAILBOX_TEXT });
        gone(d);
        return Promise.resolve({ ok: true, status: 204, json: async () => null });
      }
      if (!verb && !isAttachments && method === 'PATCH') {
        const failed = refuse(false);
        if (failed) return failed;
        if (d.status !== 'open') return alreadySent();
        const refused = draftRefusal(false);
        if (refused) return refused;
        const body = JSON.parse(String(init?.body ?? '{}')) as DraftContent & { revision?: number };
        if (body.revision === undefined) return json(400, { revision: ['Send the revision you edited.'] });
        if (body.revision !== d.revision) return changedAnswer(d);
        const invalid = contentError(d, body);
        if (invalid) return invalid;
        if (applyContent(d, body)) touched(d);
        return json(200, d);
      }
      if (isAttachments) {
        if (d.status !== 'open') return alreadySent();
        const refused = draftRefusal(false);
        if (refused) return refused;
      }
      if (isAttachments && method === 'POST') {
        const file = formFile(init);
        if (!(file instanceof File)) return json(400, { file: ['Choose a file.'] });
        const ext = extensionOf(file.name);
        if (!withinAccepted.includes(ext)) return json(400, { file: [typeRefused(ext)] });
        if (file.size === 0) return json(400, { file: [FILE_EMPTY] });
        if (file.size > MAIL_SEND_MAX_BYTES) return json(400, { file: [FILE_TOO_LARGE] });
        if (d.attachments.length >= 25) return json(400, { code: 'TOO_MANY_ATTACHMENTS', detail: 'A message can carry 25 files.' });
        if (d.total_bytes + file.size > d.max_bytes) return json(413, { code: 'DRAFT_TOO_LARGE', detail: DRAFT_TOO_LARGE_TEXT });
        const attachment: DraftAttachment = { id: nextId++, filename: file.name, mime_type: file.type || 'application/octet-stream', size: file.size, origin: 'upload', download_url: '' };
        attachment.download_url = `/api/v1/mail/attachments/${attachment.id}/download/`;
        d.attachments = [...d.attachments, attachment];
        d.total_bytes = totalOf(d);
        touched(d);
        return json(201, { attachment, revision: d.revision, total_bytes: d.total_bytes });
      }
      if (isAttachments && method === 'DELETE' && attachmentId) {
        if (!d.attachments.some((a) => a.id === Number(attachmentId))) return json(404, { detail: 'Not found.' });
        d.attachments = d.attachments.filter((a) => a.id !== Number(attachmentId));
        d.total_bytes = totalOf(d);
        touched(d);
        return json(200, { revision: d.revision, total_bytes: d.total_bytes });
      }
      // Contract §4, step by step.
      if (verb === 'send' && method === 'POST') {
        if (d.status !== 'open') return alreadySent();
        const body = JSON.parse(String(init?.body ?? '{}')) as DraftContent & { revision?: number };
        const carriesContent = (['to', 'cc', 'bcc', 'subject', 'html', 'forwarded', 'record'] as const).some((key) => body[key] !== undefined);
        if (carriesContent && body.revision === undefined) return json(400, { revision: ['Send the revision you edited.'] });
        if (body.revision !== undefined && body.revision !== d.revision) return changedAnswer(d);
        // Step 3 applies the content; the record's visibility is step 5, after the recipients (step 4).
        const invalid = contentError(d, body, true);
        if (invalid) return invalid;
        const hidden = recordRefusal(body);
        if (applyContent(d, hidden ? { ...body, record: undefined } : body)) touched(d);
        if (d.to.length + d.cc.length + d.bcc.length === 0) return json(400, { to: ['Add someone to send it to.'] });
        if (hidden) return hidden;
        if (d.total_bytes > d.max_bytes) return json(413, { code: 'MESSAGE_TOO_LARGE', detail: "This message is over Gmail's 25 MB limit. Remove an attachment." });
        const refused = draftRefusal(true);
        if (refused) return refused;
        if (state.sendAnswer) {
          const answer = state.sendAnswer;
          state.sendAnswer = null;
          // Sent, and no answer came back: left sending, pending for 10 minutes before it is unconfirmed.
          if (answer.status === 504) Object.assign(d, { status: 'sent', sending: 'pending', can_resolve: false });
          if ((answer.body as { code?: string } | null)?.code === 'DRAFT_GONE') d.gmail = { state: 'local' };
          return json(answer.status, answer.body);
        }
        Object.assign(d, { status: 'sent', sending: null, sent_at: STUB_NOW, can_resolve: false });
        const row = state.messages.find((m) => m.id === d.message_id) ?? rowOfDraft(d);
        const message: MailMessageDetail = { ...row, folder: 'sent', direction: 'sent', is_read: true, sent_at: STUB_NOW, draft: null, account: d.record ? { id: d.record.id, name: d.record.name, type: d.record.kind } : null };
        state.messages = [...state.messages.filter((m) => m.id !== d.message_id), message];
        const email = d.record ? { id: nextId++, subject: d.subject, sent_at: STUB_NOW, thread_id: d.thread_id } : null;
        return json(200, { draft: d, message, email });
      }
      if ((verb === 'confirm-sent' || verb === 'reopen') && method === 'POST') {
        if (d.sending !== 'unconfirmed') return json(409, { code: 'NOT_UNCONFIRMED', detail: "This draft isn't waiting for confirmation." });
        if (verb === 'reopen') {
          Object.assign(d, { status: 'open', sending: null, can_resolve: false });
          return json(200, d);
        }
        Object.assign(d, { status: 'sent', sending: null, sent_at: STUB_NOW, can_resolve: false });
        state.messages = state.messages.filter((m) => m.id !== d.message_id);
        return json(200, d);
      }
    }
    if (path === '/mail/gmail/search/' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      if (!q) return json(400, { q: ['Type something to search for.'] });
      if (q.length > 500) return json(400, { q: ['Keep the search under 500 characters.'] });
      const refused = searchRefusal();
      if (refused) return refused;
      const all: GmailSearchResult[] = [
        ...state.messages.filter((m) => !m.draft && !['trash', 'spam'].includes(m.folder) && matchesQ(m, q)).map((m) => ({ m, held: true })),
        ...state.gmailOnly.filter((m) => matchesQ(m, q)).map((m) => ({ m, held: false })),
      ]
        .sort((a, b) => b.m.sent_at.localeCompare(a.m.sent_at))
        .map(({ m, held }) => ({ gmail_id: `g${m.id}`, thread_id: m.thread_id, subject: m.subject, from: { name: m.from_name, address: m.from_address }, to: m.to, snippet: m.snippet, sent_at: m.sent_at, has_attachments: m.has_attachments, message_id: held ? m.id : null }));
      const start = Number(url.searchParams.get('page_token') ?? '0');
      const results = all.slice(start, start + 20);
      return json(200, { results, next_page_token: start + 20 < all.length ? String(start + 20) : null, result_size_estimate: all.length });
    }
    if (path === '/mail/gmail/search/open/' && method === 'POST') {
      const refused = searchRefusal();
      if (refused) return refused;
      const { gmail_id } = JSON.parse(String(init?.body ?? '{}')) as { gmail_id: string };
      const id = Number(gmail_id.slice(1));
      const held = state.messages.find((m) => m.id === id);
      if (held) return json(200, held);
      const only = state.gmailOnly.find((m) => m.id === id);
      if (!only) return json(404, { code: 'NOT_IN_GMAIL', detail: 'This message is no longer in Gmail.' });
      state.gmailOnly = state.gmailOnly.filter((m) => m !== only);
      state.messages.push(only);
      return json(201, only);
    }
    if (path === '/customers/' && method === 'GET') {
      return json(200, { count: 2, next: null, previous: null, results: [{ id: 2, name: 'Dough Co' }, { id: 3, name: 'Pizza Hut' }] });
    }
    if (path === '/accounts/' && method === 'GET') return json(200, { count: 0, next: null, previous: null, results: [] });
    const download = /^\/mail\/attachments\/(\d+)\/download\/$/.exec(path);
    if (download) {
      const id = Number(download[1]);
      const refusal = state.attachmentRefusals[id];
      if (refusal) return json(refusal.status, refusal.body);
      const file = state.messages.flatMap((m) => m.attachments).find((a) => a.id === id);
      if (!file) return json(404, { detail: 'Not found.' });
      const type = file.preview ? file.mime_type : 'application/octet-stream';
      return Promise.resolve({ ok: true, status: 200, json: async () => null, blob: async () => new Blob([`bytes of ${file.filename}`], { type }) });
    }
    if (path === '/mail/messages/summary/') return json(200, state.summary);
    const reply = /^\/mail\/messages\/(\d+)\/reply\/$/.exec(path);
    if (reply && method === 'POST') {
      const original = state.messages.find((m) => m.id === Number(reply[1]));
      return paused() ?? json(201, { ...original, id: 99, direction: 'sent', folder: 'sent' });
    }
    const one = /^\/mail\/messages\/(\d+)\/$/.exec(path);
    if (one) {
      const message = state.messages.find((m) => m.id === Number(one[1]));
      if (!message) return json(404, { detail: 'Not found.' });
      if (method === 'PATCH') Object.assign(message, JSON.parse(String(init?.body ?? '{}')));
      return json(200, message);
    }
    if (path === '/mail/messages/') {
      settleDrafts();
      const folder = url.searchParams.get('folder');
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const results = (folder ? state.messages.filter((m) => m.folder === folder) : state.messages).filter((m) => matchesQ(m, q)).map(rowOf);
      return json(200, { count: results.length, next: null, previous: null, results });
    }
    if (path === '/communications/stats/') {
      return json(200, { counts: { email: 0, question: 0, ticket: 0, call: 0 }, total: 0, oldest_waiting_days: null, stale_questions: 0, has_mailbox: true, scope: 'mine', ticket_scope_note: '' });
    }
    if (path.startsWith('/communications/')) return json(200, { count: 0, next: null, previous: null, results: [], truncated: false, mode: 'needs', scope: 'mine' });
    if (path.startsWith('/connectors/') || path.startsWith('/copilot/conversations/')) return json(200, []);
    return json(200, {});
  });
  // Uploads go over XMLHttpRequest (apiUpload, Decision 9): the same routes,
  // with progress reported at 40% and at the end.
  class FakeXhr {
    status = 0;
    responseText = '';
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private method = 'GET';
    private url = '';
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    send(body: FormData) {
      const file = body.get('file');
      const total = file instanceof Blob ? file.size : 0;
      void Promise.resolve().then(async () => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: Math.round(total * 0.4), total } as ProgressEvent);
        const answer = (await spy(this.url, { method: this.method, body })) as { status: number; json: () => Promise<unknown> };
        this.upload.onprogress?.({ lengthComputable: true, loaded: total, total } as ProgressEvent);
        this.status = answer.status;
        this.responseText = JSON.stringify(await answer.json());
        this.onload?.();
      });
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  vi.stubGlobal('fetch', spy);
  return { state, spy };
}
